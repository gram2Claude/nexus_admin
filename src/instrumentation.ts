import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Выполняется один раз при старте сервера (next start), НЕ при build —
 * Next 16 instrumentation. Ревью эпохи 6: без этой проверки контейнер с пустым
 * DATABASE_URL_APP выглядит «Up», а 500 всплывает только на первом запросе
 * пользователя. Мисконфиг должен быть крэшем деплоя, не тихим отказом.
 */
export async function register() {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.DATABASE_URL_APP) {
    throw new Error("DATABASE_URL_APP не задан — production не стартует без ограниченной роли");
  }
  const caPath = process.env.DB_CA_FILE || join(process.cwd(), "certs", "db-ca.crt");
  if (!existsSync(caPath)) {
    throw new Error(`Нет CA-файла ${caPath} — TLS-проверку не отключаем`);
  }
}
