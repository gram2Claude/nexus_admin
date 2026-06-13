"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import {
  getDigests,
  getJournal,
  getTopics,
  resolveChatScope,
  type Digest,
  type JournalEntry,
  type Topic,
} from "@/server/chats";

// Telegram chat_id — bigint, может быть отрицательным (супергруппы: -100…). Передаётся строкой
// (точность Number недостаточна) и кастуется к bigint в запросе; regex защищает каст.
const CHAT_ID_RE = /^-?\d+$/;
const SLUG_RE = /^[a-z0-9_-]+$/;
// Postgres bigint-диапазон: regex пропускает сколь угодно длинные числа, а каст $1::bigint вне
// диапазона бросает DB-ошибку (22003) мимо контракта {error} — проверяем диапазон заранее.
// BigInt(...) конструктором, а не литералом ...n (target ES2017 литералы не поддерживает).
const BIGINT_MIN = BigInt("-9223372036854775808");
const BIGINT_MAX = BigInt("9223372036854775807");
function validChatId(s: string): boolean {
  if (!CHAT_ID_RE.test(s)) return false;
  try {
    const v = BigInt(s);
    return v >= BIGINT_MIN && v <= BIGINT_MAX;
  } catch {
    return false;
  }
}

async function chatBinder() {
  const session = await auth();
  if (!session?.user || !can.bindChats(session.user.role)) return null;
  return session.user;
}

/**
 * Привязать чат к проекту. Кабинет — источник истины привязок (контракт B1): пишет
 * `bound_via='cabinet'` и перетирает любую запись, включая ботовую (бот свои строки кабинета
 * не трогает — его upsert идёт `WHERE bound_via='bot'`). UPDATE существующей строки чата
 * (её создаёт бот, наблюдая чат); 0 строк = чат пропал из БД → попросить обновить список.
 */
export async function bindChat(chatId: string, projectSlug: string): Promise<{ error?: string }> {
  if (!(await chatBinder())) return { error: "Недостаточно прав" };
  if (!validChatId(chatId)) return { error: "Некорректный чат" };
  if (!SLUG_RE.test(projectSlug)) return { error: "Некорректный проект" };
  // валидация slug: проект существует и не архивный (ревью плана #14)
  const { rows } = await db.query(
    "SELECT 1 FROM nexus_admin.projects WHERE slug = $1 AND NOT archived",
    [projectSlug]
  );
  if (!rows[0]) return { error: "Проект не найден" };
  try {
    const r = await db.query(
      `UPDATE tg_assistant.tg_chat_bindings
       SET project_slug = $2, bound_via = 'cabinet', updated_at = now()
       WHERE chat_id = $1::bigint`,
      [chatId, projectSlug]
    );
    if (r.rowCount === 0) return { error: "Чат не найден — обновите список" };
  } catch (e) {
    console.error("bindChat:", e);
    return { error: "Не удалось привязать чат" };
  }
  revalidatePath("/chats");
  return {};
}

/**
 * Отвязать чат: `project_slug = NULL`, `bound_via='cabinet'`, `updated_at=now()` — по контракту
 * unbind = перевод чата в «неприсвоенные» (бот наблюдает таблицу ≤5 мин). Чат не удаляется.
 */
export async function unbindChat(chatId: string): Promise<{ error?: string }> {
  if (!(await chatBinder())) return { error: "Недостаточно прав" };
  if (!validChatId(chatId)) return { error: "Некорректный чат" };
  try {
    const r = await db.query(
      `UPDATE tg_assistant.tg_chat_bindings
       SET project_slug = NULL, bound_via = 'cabinet', updated_at = now()
       WHERE chat_id = $1::bigint`,
      [chatId]
    );
    if (r.rowCount === 0) return { error: "Чат не найден — обновите список" };
  } catch (e) {
    console.error("unbindChat:", e);
    return { error: "Не удалось отвязать чат" };
  }
  revalidatePath("/chats");
  return {};
}

export type ChatContent = {
  projectSlug: string;
  projectName: string | null;
  digests: Digest[];
  topics: Topic[];
  journal: JournalEntry[];
};

/**
 * Контент чата для просмотра (TIME-76): дайджесты/темы/журнал проекта, к которому привязан чат.
 * Видимость по той же scope-модели, что и список (resolveChatScope): доступ к контенту проекта
 * проверяется ЯВНО по chat_id (employee не достанет чужой проект подбором chat_id; читающие
 * функции дополнительно фильтруют по scope). Это ЧТЕНИЕ — доступно owner/admin/employee (по
 * своим проектам), а не только тем, кто привязывает.
 */
export async function getChatContent(
  chatId: string
): Promise<{ error?: string; content?: ChatContent }> {
  if (!validChatId(chatId)) return { error: "Некорректный чат" };
  const scope = await resolveChatScope();
  if (!scope) return { error: "Недостаточно прав" };

  const { rows } = await db.query<{ project_slug: string | null; project_name: string | null }>(
    `SELECT b.project_slug, p.name AS project_name
     FROM tg_assistant.tg_chat_bindings b
     LEFT JOIN nexus_admin.projects p ON p.slug = b.project_slug
     WHERE b.chat_id = $1::bigint`,
    [chatId]
  );
  const row = rows[0];
  // видим ли чат вызывающему: существует, привязан И (admin ИЛИ проект в его scope)
  if (!row || !row.project_slug || (!scope.all && !scope.projectSlugs.includes(row.project_slug))) {
    // owner/admin видят всё → точная причина (оракула нет); employee — ЕДИНЫЙ ответ, чтобы
    // подбором chat_id нельзя было отличить существующий/чужой/непривязанный чат от
    // несуществующего (metadata-oracle вне модели видимости, ревью codex)
    if (scope.all) return { error: !row ? "Чат не найден" : "Чат не привязан к проекту" };
    return { error: "Чат недоступен" };
  }
  const slug = row.project_slug;

  const [digests, topics, journal] = await Promise.all([
    getDigests(slug, scope),
    getTopics(slug, scope),
    getJournal(slug, scope),
  ]);
  return { content: { projectSlug: slug, projectName: row.project_name, digests, topics, journal } };
}
