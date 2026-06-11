// Запросный слой факта (NEXADM-17/18) поверх view nexus_admin.v_* —
// потребители: обзор/Гант (эпоха 4) и drill-down (эпоха 5).
// Доступ роли приложения — только к view (границы проверены setup-app-role).
import "server-only";

import { db } from "@/lib/db";

export type TaskFact = {
  readable_id: string;
  project_slug: string;
  fact_minutes: number;
  tokens: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number;
  executor: string | null;
};

export type ModelFact = {
  readable_id: string | null; // null = «нераспределённое» (бакет портфеля)
  project_slug: string | null;
  model: string;
  minutes: number;
  tokens: number;
  cache_read: number;
  cache_creation: number;
  cost_usd: number;
};

export type LevelFact = {
  fact_minutes: number;
  tokens: number;
  cost_usd: number;
};

/** Факт по задачам проекта (для уровня задач drill-down). */
export async function taskFactsByProject(projectSlug: string): Promise<TaskFact[]> {
  const { rows } = await db.query<TaskFact>(
    `SELECT readable_id, project_slug, fact_minutes::float8 AS fact_minutes,
            tokens::float8 AS tokens, cache_read::float8 AS cache_read,
            cache_creation::float8 AS cache_creation, cost_usd::float8 AS cost_usd, executor
     FROM nexus_admin.v_task_fact WHERE project_slug = $1`,
    [projectSlug]
  );
  return rows;
}

/**
 * Roll-up факта на уровень спринтов проекта. Архивные задачи ВКЛЮЧЕНЫ
 * (их затраты реальны) — единообразно с epochFactRollupAll (ревью эпохи 5).
 */
export async function sprintFactRollup(
  projectSlug: string
): Promise<Map<string, LevelFact>> {
  const { rows } = await db.query(
    `SELECT s.ext_id AS sprint_ext_id,
            SUM(f.fact_minutes)::float8 AS fact_minutes,
            SUM(f.tokens)::float8 AS tokens,
            SUM(f.cost_usd)::float8 AS cost_usd
     FROM nexus_admin.tasks t
     JOIN nexus_admin.sprints s ON s.id = t.sprint_id
     JOIN nexus_admin.projects p ON p.id = t.project_id
     JOIN nexus_admin.v_task_fact f
       ON f.readable_id = t.readable_id AND f.project_slug = p.slug
     WHERE p.slug = $1 AND NOT s.archived AND NOT p.archived
     GROUP BY s.ext_id`,
    [projectSlug]
  );
  return new Map(rows.map((r) => [r.sprint_ext_id, r]));
}

/**
 * Разбивка задачи по моделям AI (клик по задаче, эпоха 5).
 * Скоуп по project_slug обязателен: readable_id не уникален глобально (ревью эпохи 5).
 */
export async function modelFactsByTask(
  readableId: string,
  projectSlug: string
): Promise<ModelFact[]> {
  const { rows } = await db.query<ModelFact>(
    `SELECT readable_id, project_slug, model, minutes::float8 AS minutes,
            tokens::float8 AS tokens, cache_read::float8 AS cache_read,
            cache_creation::float8 AS cache_creation, cost_usd::float8 AS cost_usd
     FROM nexus_admin.v_task_model_fact
     WHERE readable_id = $1 AND project_slug = $2 AND (tokens > 0 OR minutes > 0)
     ORDER BY cost_usd DESC`,
    [readableId, projectSlug]
  );
  return rows;
}

export type EpochFact = {
  project_slug: string;
  epoch_ext_id: string;
  fact_minutes: number;
  tokens: number;
  cost_usd: number;
};

/** Факт по эпохам всех проектов (тултипы Ганта, NEXADM-23). */
export async function epochFactRollupAll(): Promise<EpochFact[]> {
  const { rows } = await db.query<EpochFact>(
    `SELECT p.slug AS project_slug, e.ext_id AS epoch_ext_id,
            SUM(f.fact_minutes)::float8 AS fact_minutes,
            SUM(f.tokens)::float8 AS tokens,
            SUM(f.cost_usd)::float8 AS cost_usd
     FROM nexus_admin.tasks t
     JOIN nexus_admin.sprints s ON s.id = t.sprint_id
     JOIN nexus_admin.epochs e ON e.id = s.epoch_id
     JOIN nexus_admin.projects p ON p.id = t.project_id
     JOIN nexus_admin.v_task_fact f
       ON f.readable_id = t.readable_id AND f.project_slug = p.slug
     WHERE NOT p.archived AND NOT e.archived
     GROUP BY p.slug, e.ext_id`
  );
  return rows;
}

export type ProjectFact = {
  project_slug: string;
  fact_minutes: number;
  tokens: number;
  cost_usd: number;
};

/** Факт по проектам целиком (строка факта в карточках обзора, NEXADM-21). */
export async function projectFactRollupAll(): Promise<ProjectFact[]> {
  const { rows } = await db.query<ProjectFact>(
    `SELECT project_slug, SUM(fact_minutes)::float8 AS fact_minutes,
            SUM(tokens)::float8 AS tokens, SUM(cost_usd)::float8 AS cost_usd
     FROM nexus_admin.v_task_fact
     GROUP BY project_slug`
  );
  return rows;
}

/** Бакет «нераспределённое» (затраты без привязки к задаче) — уровень портфеля. */
export async function unallocatedModelFacts(): Promise<ModelFact[]> {
  const { rows } = await db.query<ModelFact>(
    `SELECT readable_id, project_slug, model, minutes::float8 AS minutes,
            tokens::float8 AS tokens, cache_read::float8 AS cache_read,
            cache_creation::float8 AS cache_creation, cost_usd::float8 AS cost_usd
     FROM nexus_admin.v_task_model_fact
     -- project_slug IS NULL: задачи без identifier не смешиваются с бакетом портфеля (ревью 3.2)
     WHERE readable_id IS NULL AND project_slug IS NULL AND (tokens > 0 OR minutes > 0)
     ORDER BY cost_usd DESC`
  );
  return rows;
}
