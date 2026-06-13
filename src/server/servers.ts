import "server-only";

import { db } from "@/lib/db";

// Слой данных раздела «Серверы» (схема server_checker, наполняет коллектор
// репозитория server_checker). Кабинет ТОЛЬКО читает метрики; пишет лишь в
// server_checker.server (регистрация серверов, actions.ts).
// Схема может отсутствовать на свежей БД (кросс-репо порядок миграций) —
// каждый запрос обёрнут в schemaSafe → пустое состояние вместо падения.

export type ServerOverview = {
  id: number;
  name: string;
  host: string;
  port: number;
  ssh_user: string;
  key_name: string | null;
  poll_interval_min: number;
  enabled: boolean;
  provider: string | null;
  purpose: string | null;
  last_ts: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  cpu_pct: number | null;
  load1: number | null;
  mem_used_pct: string | null;
  disk_max_used_pct: string | null;
  mem_total_mb: number | null;
  mem_available_mb: number | null;
  swap_total_mb: number | null;
  verdict_status: "ok" | "warning" | "critical" | null;
  verdict_recommendations: Recommendation[] | null;
  verdict_ts: string | null;
  incidents_24h: string;
  incidents_open: string;
};

export type Recommendation = { code: string; severity: "warning" | "critical"; text: string };

export type Inventory = {
  os?: string;
  kernel?: string;
  cpu_model?: string;
  cpu_cores?: number;
  mem_total_mb?: number;
  swap_total_mb?: number;
  disks?: { mount: string; size_b: number }[];
  docker_version?: string | null;
  containers?: { name: string; state: string; restartCount: number; exitCode: number }[];
  listen_ports?: { port: number; proc: string | null }[];
  boot_since?: string | null;
};

export type IncidentRow = {
  id: number;
  type: string;
  severity: "warning" | "critical";
  started_at: string;
  ended_at: string | null;
  details: Record<string, unknown> | null;
};

export type SeriesPoint = {
  bucket: string;
  cpu_avg: string | null;
  cpu_max: string | null;
  mem_avg: string | null;
  mem_max: string | null;
  disk_avg: string | null;
};

export type AggRow = {
  period: "day" | "week" | "month";
  cpu_avg: string | null;
  cpu_max: string | null;
  mem_avg: string | null;
  mem_max: string | null;
  disk_avg: string | null;
  availability_pct: string | null;
  incidents: string;
};

/** Схема server_checker может отсутствовать (42P01/3F000) — пустое состояние, не падение.
 *  42501 (нет прав) тоже не роняет страницу, но логируется: сломанные гранты не должны
 *  молча выглядеть как «серверов нет» (ревью). */
async function schemaSafe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42501") {
      console.error("server_checker: нет прав у роли кабинета — прогони setup-roles.mjs в репозитории server_checker");
      return fallback;
    }
    if (code === "42P01" || code === "3F000") return fallback;
    throw e;
  }
}

export async function listServers(): Promise<ServerOverview[]> {
  return schemaSafe(
    async () =>
      (
        await db.query<ServerOverview>(
          `SELECT * FROM server_checker.v_server_overview ORDER BY name`
        )
      ).rows,
    []
  );
}

export async function getServer(id: number): Promise<ServerOverview | null> {
  return schemaSafe(
    async () =>
      (
        await db.query<ServerOverview>(
          `SELECT * FROM server_checker.v_server_overview WHERE id = $1`,
          [id]
        )
      ).rows[0] ?? null,
    null
  );
}

export async function getInventory(id: number): Promise<Inventory | null> {
  return schemaSafe(
    async () =>
      (
        await db.query<{ inventory: Inventory }>(
          `SELECT inventory FROM server_checker.server_param WHERE server_id = $1`,
          [id]
        )
      ).rows[0]?.inventory ?? null,
    null
  );
}

export async function getIncidents(id: number, limit = 50): Promise<IncidentRow[]> {
  return schemaSafe(
    async () =>
      (
        await db.query<IncidentRow>(
          `SELECT id, type, severity, started_at::text, ended_at::text, details
           FROM server_checker.incident WHERE server_id = $1
           ORDER BY started_at DESC LIMIT $2`,
          [id, limit]
        )
      ).rows,
    []
  );
}

export async function getAggregates(id: number): Promise<AggRow[]> {
  return schemaSafe(
    async () =>
      (
        await db.query<AggRow>(
          `SELECT period, cpu_avg, cpu_max, mem_avg, mem_max, disk_avg, availability_pct, incidents
           FROM server_checker.v_agg_period WHERE server_id = $1`,
          [id]
        )
      ).rows,
    []
  );
}

/** Ряды для графиков: day → почасовые за 24 ч, week → почасовые за 7 д, month → подневные за 30 д.
 *  Ревью: фильтруем по ts ИСХОДНОЙ таблицы (sargable, работает индекс server_id+ts),
 *  а не по bucket готовой view — иначе агрегируется вся история. Дата — строгий ISO
 *  (Safari не парсит "YYYY-MM-DD HH:MM:SS+00" из bucket::text). */
export async function getSeries(
  id: number
): Promise<{ day: SeriesPoint[]; week: SeriesPoint[]; month: SeriesPoint[] }> {
  const seriesQ = (trunc: "hour" | "day", win: string) =>
    db.query<SeriesPoint>(
      `SELECT to_char(date_trunc('${trunc}', ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket,
         round(avg(cpu_pct)::numeric, 1)::text  AS cpu_avg,
         round(max(cpu_pct)::numeric, 1)::text  AS cpu_max,
         round(avg(mem_used_pct)::numeric, 1)::text AS mem_avg,
         round(max(mem_used_pct)::numeric, 1)::text AS mem_max,
         round(avg(disk_max_used_pct)::numeric, 1)::text AS disk_avg
       FROM server_checker.v_snapshot_enriched
       WHERE server_id = $1 AND ts > now() - $2::interval
       GROUP BY date_trunc('${trunc}', ts) ORDER BY 1`,
      [id, win]
    );
  return schemaSafe(
    async () => {
      const [day, week, month] = await Promise.all([
        seriesQ("hour", "24 hours"),
        seriesQ("hour", "7 days"),
        seriesQ("day", "30 days"),
      ]);
      return { day: day.rows, week: week.rows, month: month.rows };
    },
    { day: [], week: [], month: [] }
  );
}
