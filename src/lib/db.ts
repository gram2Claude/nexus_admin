import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

// Приложение ходит ограниченной ролью nexus_admin_app (NEXADM-16): схема кабинета +
// view факта; public.* недоступен. Тихий fallback на админский DSN запрещён в проде
// (ревью 3.2: потеря env молча обнуляла бы границу роли).
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL_APP) {
  throw new Error("DATABASE_URL_APP не задан — в production админский DSN запрещён");
}
const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_APP / DATABASE_URL не заданы");

// sslmode в строке перебивает явную ssl-опцию pg — убираем через URL API (ревью 2.1:
// regex ломался на нескольких query-параметрах)
const u = new URL(url);
u.searchParams.delete("sslmode");

// TLS: пиним CA Supabase (intermediate+root, снят с живого эндпоинта 2026-06-11,
// trust-on-first-use). rejectUnauthorized:false убран по ревью 2.1 (MITM до БД).
const caPath = join(process.cwd(), "certs", "supabase-ca.crt");
if (!existsSync(caPath)) throw new Error(`Нет CA-файла ${caPath} — TLS-проверку не отключаем`);

// Pool маленький: Supabase pooler (transaction mode) + соседство с timechecker (риск спеки §6)
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForPg.pgPool ??
  new Pool({
    connectionString: u.toString(),
    ssl: { ca: readFileSync(caPath, "utf8") },
    max: 3,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = db;
