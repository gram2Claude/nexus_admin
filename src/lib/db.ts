import { Pool } from "pg";

// sslmode в строке перебивает явную ssl-опцию pg — вырезаем и задаём ssl сами
const url = process.env.DATABASE_URL ?? "";
const cleanUrl = url.replace(/[?&]sslmode=[^&]+/, "");

// Pool маленький: Supabase pooler (transaction mode) + соседство с timechecker (риск спеки §6)
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const db =
  globalForPg.pgPool ??
  new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = db;
