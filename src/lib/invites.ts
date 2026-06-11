import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import { can, canModifyUser, type Role } from "@/lib/rbac";

const INVITE_TTL_MS = 7 * 24 * 3600_000; // 7 дней (спека 2.2)

/** Бизнес-ошибки инвайтов — только их текст показывается пользователю (ревью 2.2). */
export class InviteError extends Error {}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Создаёт/перевыпускает приглашение. RBAC-проверки над существующей строкой — здесь,
 * под локом (ревью 2.2: обход guard'а перевыпуска через диалог инвайта закрыт).
 * Порядок локов ЕДИНЫЙ для всех флоу: users → invites (анти-deadlock).
 * @returns голый токен (показывается один раз); бросает InviteError с текстом для UI.
 */
export async function createInvite(
  email: string,
  name: string | null,
  role: Exclude<Role, "owner">,
  actor: { id: string; role: Role }
): Promise<string> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, role, status FROM nexus_admin.users WHERE email = $1 FOR UPDATE",
      [email]
    );
    const existing = rows[0];
    if (existing && existing.status === "active") {
      throw new InviteError("Пользователь с этим email уже активен");
    }
    if (existing && !canModifyUser(actor.role, existing.role as Role)) {
      throw new InviteError("Недостаточно прав для этого пользователя");
    }
    if ((role === "admin" || existing?.role === "admin") && !can.assignAdmin(actor.role)) {
      throw new InviteError("Приглашать и менять Admin может только Owner");
    }
    if (existing) {
      // возврат в invited + сброс пароля (ревью 2.2: disabled оставался disabled —
      // активация была невозможна никогда)
      await client.query(
        `UPDATE nexus_admin.users
         SET role = $2, name = COALESCE($3, name), status = 'invited',
             password_hash = NULL, updated_at = now()
         WHERE id = $1`,
        [existing.id, role, name]
      );
    } else {
      await client.query(
        "INSERT INTO nexus_admin.users (email, name, role, status) VALUES ($1, $2, $3, 'invited')",
        [email, name, role]
      );
    }
    await client.query(
      "DELETE FROM nexus_admin.invites WHERE email = $1 AND used_at IS NULL",
      [email]
    );
    const token = randomBytes(32).toString("hex");
    await client.query(
      `INSERT INTO nexus_admin.invites (email, role, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, role, hashToken(token), new Date(Date.now() + INVITE_TTL_MS), actor.id]
    );
    await client.query("COMMIT");
    return token;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Информация о валидном (не использованном, не просроченном) токене или null. */
export async function peekInvite(token: string): Promise<{ email: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { rows } = await db.query(
    `SELECT email FROM nexus_admin.invites
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  return rows[0] ?? null;
}

/**
 * Активация по токену: ставит пароль, переводит пользователя в active, гасит инвайт.
 * bcrypt — только ПОСЛЕ подтверждения существования валидного токена (ревью 2.2: CPU-DoS).
 * Порядок локов users → invites, с перепроверкой токена под локом.
 * @returns email активированного пользователя или null.
 */
export async function consumeInvite(token: string, password: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const th = hashToken(token);

  // фаза 1 (без локов и без bcrypt): токен вообще существует и жив?
  const peek = await db.query(
    "SELECT email FROM nexus_admin.invites WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()",
    [th]
  );
  if (!peek.rows[0]) return null;
  const email: string = peek.rows[0].email;

  const passwordHash = await bcrypt.hash(password, 12);

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // лок users ПЕРВЫМ (единый порядок с createInvite)
    await client.query("SELECT id FROM nexus_admin.users WHERE email = $1 FOR UPDATE", [email]);
    // перепроверка токена под локом: мог погаснуть между фазами
    const { rows } = await client.query(
      `SELECT id FROM nexus_admin.invites
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [th]
    );
    const invite = rows[0];
    if (!invite) {
      await client.query("ROLLBACK");
      return null;
    }
    const upd = await client.query(
      `UPDATE nexus_admin.users
       SET password_hash = $2, status = 'active', pw_changed_at = now(), updated_at = now()
       WHERE email = $1 AND status = 'invited'`,
      [email, passwordHash]
    );
    if (upd.rowCount === 0) {
      // строка users не в invited (удалена/изменена) — НЕ говорим «пароль сохранён» (ревью 2.2)
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("UPDATE nexus_admin.invites SET used_at = now() WHERE id = $1", [
      invite.id,
    ]);
    await client.query("COMMIT");
    return email;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
