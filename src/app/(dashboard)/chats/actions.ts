"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

// Telegram chat_id — bigint, может быть отрицательным (супергруппы: -100…). Передаётся строкой
// (точность Number недостаточна) и кастуется к bigint в запросе; regex защищает каст.
const CHAT_ID_RE = /^-?\d+$/;
const SLUG_RE = /^[a-z0-9_-]+$/;

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
  if (!CHAT_ID_RE.test(chatId)) return { error: "Некорректный чат" };
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
  if (!CHAT_ID_RE.test(chatId)) return { error: "Некорректный чат" };
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
