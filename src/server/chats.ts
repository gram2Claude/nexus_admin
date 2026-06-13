// Запросный слой раздела «Чаты» (E11, TIME-73) поверх схемы обмена tg_assistant
// (Supabase проекта timechecker; миграция v6 на стороне timechecker, контракт TGA-26).
// Кабинет ЧИТАЕТ дайджесты/темы/журнал и привязки; ПИШЕТ привязки (bound_via='cabinet',
// см. actions раздела «Чаты», TIME-74). Доступ роли приложения nexus_admin_app — гранты в
// scripts/db/setup-app-role.mjs (SELECT на 4 таблицы + INSERT/UPDATE на tg_chat_bindings).
//
// Видимость по ролям (Cx#11 — иначе утечка контента чатов между employee): каждое чтение
// требует ChatScope. Owner/Admin видят все чаты (вкл. непривязанные); Employee — только чаты
// проектов, где он участник (project_members); Client доступа не имеет (scope = null).
import "server-only";

import { auth } from "@/auth";
import { db } from "@/lib/db";

// chat_id и journal.id — bigint: node-pg отдаёт их строкой (потеря точности у Number для
// Telegram chat_id и больших id), поэтому ::text и тип string.
export type ChatBinding = {
  chat_id: string;
  project_slug: string | null; // NULL = непривязанный чат (решение 6.2 контракта)
  project_name: string | null; // имя проекта по slug (NULL для непривязанных)
  chat_title: string;
  bound_via: "cabinet" | "bot";
  active: boolean;
  updated_at: string;
};

export type Digest = {
  project_slug: string;
  date: string;
  content_md: string;
  created_at: string;
};

export type Topic = {
  project_slug: string;
  name: string;
  content_md: string;
  updated_at: string;
};

export type JournalEntry = {
  id: string;
  project_slug: string;
  kind: "decision" | "wish";
  date: string;
  text: string;
};

// Owner/Admin: { all: true }. Employee: { all: false, projectSlugs }. Client/гость: null.
export type ChatScope = { all: true } | { all: false; projectSlugs: string[] };

/** Разрешить доступ к контенту конкретного проекта (общий guard для чтений). */
function allowed(scope: ChatScope, projectSlug: string): boolean {
  return scope.all || scope.projectSlugs.includes(projectSlug);
}

/**
 * Видимость текущего пользователя для раздела «Чаты». null = нет доступа (Client).
 * Зеркалит правило projects/page.tsx (Employee — только проекты с membership).
 */
export async function resolveChatScope(): Promise<ChatScope | null> {
  const session = await auth();
  const role = session?.user?.role ?? "client";
  if (role === "owner" || role === "admin") return { all: true };
  if (role === "employee") {
    const { rows } = await db.query<{ slug: string }>(
      `SELECT p.slug
       FROM nexus_admin.projects p
       JOIN nexus_admin.project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1 AND NOT p.archived`,
      [session!.user.id]
    );
    return { all: false, projectSlugs: rows.map((r) => r.slug) };
  }
  return null;
}

/**
 * Список чатов. Owner/Admin — все, включая непривязанные (project_slug IS NULL — их
 * нужно привязать из кабинета). Employee — только привязки своих проектов (непривязанные
 * НЕ показываются: их видит тот, кто привязывает). Непривязанные сверху, далее по свежести.
 *
 * Возвращаются и неактивные привязки (`active=false` — «скрытый чат» по контракту): фильтрацию/
 * бейдж «скрыт» решает UI раздела (TIME-75), чтобы оставить возможность их видеть/реактивировать.
 */
export async function listChats(scope: ChatScope): Promise<ChatBinding[]> {
  if (scope.all) {
    const { rows } = await db.query<ChatBinding>(
      `SELECT b.chat_id::text, b.project_slug, p.name AS project_name,
              b.chat_title, b.bound_via, b.active, b.updated_at::text
       FROM tg_assistant.tg_chat_bindings b
       LEFT JOIN nexus_admin.projects p ON p.slug = b.project_slug
       ORDER BY (b.project_slug IS NULL) DESC, b.updated_at DESC`
    );
    return rows;
  }
  if (scope.projectSlugs.length === 0) return [];
  const { rows } = await db.query<ChatBinding>(
    `SELECT b.chat_id::text, b.project_slug, p.name AS project_name,
            b.chat_title, b.bound_via, b.active, b.updated_at::text
     FROM tg_assistant.tg_chat_bindings b
     LEFT JOIN nexus_admin.projects p ON p.slug = b.project_slug
     WHERE b.project_slug = ANY($1)
     ORDER BY b.updated_at DESC`,
    [scope.projectSlugs]
  );
  return rows;
}

// Потолки выборки контента (TIME-80, DoS-харднинг): ограничивают число строк, которые кабинет
// тянет и рендерит за раз, если бот записал тысячи записей. Щедрые относительно реального объёма
// (дайджест — 1/день, темы — единицы, журнал — десятки): обычный просмотр не урезается. Длину
// КАЖДОЙ строки ограничивает CHECK в схеме (миграция v7). Новые — сверху.
const DIGESTS_LIMIT = 365; // ~год дневных дайджестов
const TOPICS_LIMIT = 500;
const JOURNAL_LIMIT = 500;

/** Дайджесты проекта (новые сверху, до DIGESTS_LIMIT). Пустой список, если проект вне видимости. */
export async function getDigests(projectSlug: string, scope: ChatScope): Promise<Digest[]> {
  if (!allowed(scope, projectSlug)) return [];
  const { rows } = await db.query<Digest>(
    `SELECT project_slug, date::text, content_md, created_at::text
     FROM tg_assistant.tg_digests WHERE project_slug = $1 ORDER BY date DESC LIMIT ${DIGESTS_LIMIT}`,
    [projectSlug]
  );
  return rows;
}

/** Темы проекта (по алфавиту, до TOPICS_LIMIT). Пустой список, если проект вне видимости. */
export async function getTopics(projectSlug: string, scope: ChatScope): Promise<Topic[]> {
  if (!allowed(scope, projectSlug)) return [];
  const { rows } = await db.query<Topic>(
    `SELECT project_slug, name, content_md, updated_at::text
     FROM tg_assistant.tg_topics WHERE project_slug = $1 ORDER BY name LIMIT ${TOPICS_LIMIT}`,
    [projectSlug]
  );
  return rows;
}

/** Журнал решений/пожеланий проекта (новые сверху, до JOURNAL_LIMIT). Пусто, если вне видимости. */
export async function getJournal(projectSlug: string, scope: ChatScope): Promise<JournalEntry[]> {
  if (!allowed(scope, projectSlug)) return [];
  const { rows } = await db.query<JournalEntry>(
    `SELECT id::text, project_slug, kind, date::text, text
     FROM tg_assistant.tg_journal WHERE project_slug = $1
     ORDER BY date DESC, id DESC LIMIT ${JOURNAL_LIMIT}`,
    [projectSlug]
  );
  return rows;
}
