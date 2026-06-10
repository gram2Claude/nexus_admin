import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool } from "pg";

// Fail fast: без DATABASE_URL приложение не должно молча подключаться к localhost (ревью 2.1)
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL не задан");

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
