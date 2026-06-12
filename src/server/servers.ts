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

/** Схема server_checker может отсутствовать (42P01/3F000) — пустое состояние, не падение */
async function schemaSafe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01" || code === "3F000" || code === "42501") return fallback;
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

/** Ряды для графиков: day → почасовые за 24 ч, week → почасовые за 7 д, month → подневные за 30 д */
export async function getSeries(
  id: number
): Promise<{ day: SeriesPoint[]; week: SeriesPoint[]; month: SeriesPoint[] }> {
  const hourQ = (win: string) =>
    db.query<SeriesPoint>(
      `SELECT bucket::text, cpu_avg, cpu_max, mem_avg, mem_max, disk_avg
       FROM server_checker.v_series_hour
       WHERE server_id = $1 AND bucket > now() - $2::interval ORDER BY bucket`,
      [id, win]
    );
  return schemaSafe(
    async () => {
      const [day, week, month] = await Promise.all([
        hourQ("24 hours"),
        hourQ("7 days"),
        db.query<SeriesPoint>(
          `SELECT bucket::text, cpu_avg, cpu_max, mem_avg, mem_max, disk_avg
           FROM server_checker.v_series_day
           WHERE server_id = $1 AND bucket > now() - interval '30 days' ORDER BY bucket`,
          [id]
        ),
      ]);
      return { day: day.rows, week: week.rows, month: month.rows };
    },
    { day: [], week: [], month: [] }
  );
}
