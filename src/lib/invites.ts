import { createHash, randomBytes } from "node:crypto";

import bcrypt from "bcryptjs";

import { db } from "@/lib/db";
import type { Role } from "@/lib/rbac";

const INVITE_TTL_MS = 7 * 24 * 3600_000; // 7 дней (спека 2.2)

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Создаёт/перевыпускает приглашение: строка users (status=invited) + одноразовый токен.
 * В БД хранится только SHA-256-хэш токена. Старые неиспользованные инвайты email'а гаснут.
 * @returns голый токен (показывается один раз) или бросает Error с текстом для UI.
 */
export async function createInvite(
  email: string,
  name: string | null,
  role: Exclude<Role, "owner">,
  createdBy: string
): Promise<string> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, status FROM nexus_admin.users WHERE email = $1 FOR UPDATE",
      [email]
    );
    const existing = rows[0];
    if (existing && existing.status === "active") {
      throw new Error("Пользователь с этим email уже активен");
    }
    if (existing) {
      await client.query(
        "UPDATE nexus_admin.users SET role = $2, name = COALESCE($3, name), updated_at = now() WHERE id = $1",
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
      [email, role, hashToken(token), new Date(Date.now() + INVITE_TTL_MS), createdBy]
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
 * @returns email активированного пользователя или null (битый/использованный/просроченный токен).
 */
export async function consumeInvite(token: string, password: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, email FROM nexus_admin.invites
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [hashToken(token)]
    );
    const invite = rows[0];
    if (!invite) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `UPDATE nexus_admin.users SET password_hash = $2, status = 'active', updated_at = now()
       WHERE email = $1 AND status = 'invited'`,
      [invite.email, passwordHash]
    );
    await client.query("UPDATE nexus_admin.invites SET used_at = now() WHERE id = $1", [
      invite.id,
    ]);
    await client.query("COMMIT");
    return invite.email;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
