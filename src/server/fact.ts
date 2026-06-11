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

/** Roll-up факта на уровень спринтов/эпох/проекта: join план-задач кабинета с фактом. */
export async function levelFactRollup(
  projectSlug: string
): Promise<Map<string, LevelFact & { sprint_ext_id: string; epoch_ext_id: string }>> {
  const { rows } = await db.query(
    `SELECT s.ext_id AS sprint_ext_id, e.ext_id AS epoch_ext_id,
            SUM(f.fact_minutes)::float8 AS fact_minutes,
            SUM(f.tokens)::float8 AS tokens,
            SUM(f.cost_usd)::float8 AS cost_usd
     FROM nexus_admin.tasks t
     JOIN nexus_admin.sprints s ON s.id = t.sprint_id
     JOIN nexus_admin.epochs e ON e.id = s.epoch_id
     JOIN nexus_admin.projects p ON p.id = t.project_id
     JOIN nexus_admin.v_task_fact f ON f.readable_id = t.readable_id
     WHERE p.slug = $1 AND NOT t.archived
     GROUP BY s.ext_id, e.ext_id`,
    [projectSlug]
  );
  return new Map(rows.map((r) => [r.sprint_ext_id, r]));
}

/** Разбивка задачи по моделям AI (клик по задаче, эпоха 5). */
export async function modelFactsByTask(readableId: string): Promise<ModelFact[]> {
  const { rows } = await db.query<ModelFact>(
    `SELECT readable_id, project_slug, model, minutes::float8 AS minutes,
            tokens::float8 AS tokens, cache_read::float8 AS cache_read,
            cache_creation::float8 AS cache_creation, cost_usd::float8 AS cost_usd
     FROM nexus_admin.v_task_model_fact
     WHERE readable_id = $1 AND (tokens > 0 OR minutes > 0)
     ORDER BY cost_usd DESC`,
    [readableId]
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
     WHERE readable_id IS NULL AND (tokens > 0 OR minutes > 0)
     ORDER BY cost_usd DESC`
  );
  return rows;
}
