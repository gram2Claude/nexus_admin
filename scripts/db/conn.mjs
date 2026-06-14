// Общий конфиг подключения для db-скриптов (ревью 2.1: один источник вместо трёх копий).
// TLS: пиним CA БД (certs/db-ca.crt, переопределяемо DB_CA_FILE; intermediate+root, снят с живого
// эндпоинта 2026-06-11 — trust-on-first-use); без файла — честный fail, не отключение проверки.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const caPath = process.env.DB_CA_FILE || join(root, "certs", "db-ca.crt");

/**
 * @param {{sessionMode?: boolean}} [opts] sessionMode: переключает Supavisor-порт
 *   6543 (transaction) → 5432 (session). Нужен скриптам с session-семантикой —
 *   advisory locks через transaction-pooler ложатся на случайный backend и текут
 *   (ревью 3.1). Приложению (короткие запросы) остаётся transaction-режим.
 */
export function pgConfig(opts = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан (env / .env.local)");
  // sslmode в строке перебивает явную ssl-опцию pg — убираем через URL API
  const u = new URL(url);
  u.searchParams.delete("sslmode");
  if (opts.sessionMode) {
    // transaction-пул → session. Supabase Supavisor: порт 6543→5432;
    // self-host PgBouncer: единый порт, session-логическая БД postgres_session.
    if (u.port === "6543") u.port = "5432";                       // Supabase Supavisor: txn→session порт
    else if (process.env.DB_SESSION_DBNAME)                       // self-host: ЯВНЫЙ opt-in (ревью: не «любой не-6543»)
      u.pathname = `/${process.env.DB_SESSION_DBNAME}`;           //   DDL/миграции self-host: DB_SESSION_DBNAME=postgres_session
  }
  if (!existsSync(caPath)) throw new Error(`Нет CA-файла ${caPath} — TLS-проверку не отключаем`);
  return {
    connectionString: u.toString(),
    // verify-ca (Q5): CA пинуем, hostname не проверяем (БД по IP, серт SAN=IP; node-pg иначе падает на servername)
    ssl: { ca: readFileSync(caPath, "utf8"), checkServerIdentity: () => undefined },
  };
}
