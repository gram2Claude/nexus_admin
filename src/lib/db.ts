import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

// Инициализация ЛЕНИВАЯ (при первом запросе, не при импорте): next build в Docker
// импортирует модули на этапе collect page data, когда секретов нет и не должно быть —
// module-level fail-fast ронял сборку образа (деплой NEXADM-31).
function makePool(): Pool {
  // Приложение ходит ограниченной ролью nexus_admin_app (NEXADM-16). Тихий fallback
  // на админский DSN запрещён в проде (ревью 3.2).
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL_APP) {
    throw new Error("DATABASE_URL_APP не задан — в production админский DSN запрещён");
  }
  const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_APP / DATABASE_URL не заданы");

  // sslmode в строке перебивает явную ssl-опцию pg — убираем через URL API (ревью 3.1)
  const u = new URL(url);
  u.searchParams.delete("sslmode");

  // TLS: пиним CA Supabase (ревью 2.1); без файла — честный fail, не отключение проверки
  const caPath = join(process.cwd(), "certs", "supabase-ca.crt");
  if (!existsSync(caPath)) throw new Error(`Нет CA-файла ${caPath} — TLS-проверку не отключаем`);

  // Pool маленький: Supabase pooler (transaction mode) + соседство с timechecker (риск спеки §6)
  return new Pool({
    connectionString: u.toString(),
    ssl: { ca: readFileSync(caPath, "utf8") },
    max: 3,
    idleTimeoutMillis: 30_000,
  });
}

const globalForPg = globalThis as unknown as { pgPool?: Pool };

function getPool(): Pool {
  if (!globalForPg.pgPool) globalForPg.pgPool = makePool();
  return globalForPg.pgPool;
}

export const db = {
  // дефолт any — как у pg.Pool.query: нетипизированные вызовы остаются совместимыми
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<T extends QueryResultRow = any>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return getPool().query<T>(text, params as never[]);
  },
  connect(): Promise<PoolClient> {
    return getPool().connect();
  },
};
