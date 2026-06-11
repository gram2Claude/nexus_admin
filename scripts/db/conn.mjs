// Общий конфиг подключения для db-скриптов (ревью 2.1: один источник вместо трёх копий).
// TLS: пиним CA Supabase (certs/supabase-ca.crt, intermediate+root, снят с живого
// эндпоинта 2026-06-11 — trust-on-first-use); без файла — честный fail, не отключение проверки.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const caPath = join(root, "certs", "supabase-ca.crt");

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
  if (opts.sessionMode && u.port === "6543") u.port = "5432";
  if (!existsSync(caPath)) throw new Error(`Нет CA-файла ${caPath} — TLS-проверку не отключаем`);
  return {
    connectionString: u.toString(),
    ssl: { ca: readFileSync(caPath, "utf8") },
  };
}
