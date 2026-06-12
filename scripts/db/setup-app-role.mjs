// Роль приложения nexus_admin_app (NEXADM-16): read/write только на схему кабинета,
// факт timechecker — исключительно через view (owner-цепочка), public.* недоступен напрямую.
// Идемпотентен. env: APP_DB_PASSWORD (обязателен).
import pg from "pg";

import { pgConfig } from "./conn.mjs";

const password = process.env.APP_DB_PASSWORD;
if (!password) {
  console.error("Нужен env APP_DB_PASSWORD");
  process.exit(1);
}
if (!/^[A-Za-z0-9]{24,}$/.test(password)) {
  console.error("APP_DB_PASSWORD: минимум 24 символа A-Za-z0-9 (попадает в SQL-литерал)");
  process.exit(1);
}

const client = new pg.Client(pgConfig({ sessionMode: true }));
await client.connect();
try {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexus_admin_app') THEN
        CREATE ROLE nexus_admin_app LOGIN;
      END IF;
    END $$;
  `);
  await client.query(`ALTER ROLE nexus_admin_app LOGIN PASSWORD '${password}'`);

  await client.query("GRANT USAGE ON SCHEMA nexus_admin TO nexus_admin_app");
  await client.query("GRANT SELECT ON ALL TABLES IN SCHEMA nexus_admin TO nexus_admin_app");
  await client.query(
    "GRANT INSERT, UPDATE, DELETE ON nexus_admin.users, nexus_admin.invites, nexus_admin.project_members TO nexus_admin_app"
  );
  await client.query(
    "GRANT UPDATE (description, description_source) ON nexus_admin.projects TO nexus_admin_app"
  );
  // действует на объекты, создаваемые ТЕКУЩИМ юзером (postgres из DATABASE_URL) —
  // миграции гоняем только под ним; объекты из Dashboard грантов не получат (ревью 3.2)
  await client.query(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA nexus_admin GRANT SELECT ON TABLES TO nexus_admin_app"
  );
  // public.* НЕ грантится вовсе — факт только через view nexus_admin.v_*
} finally {
  await client.end();
}

// Верификация границ — РЕАЛЬНЫМ логином новой роли через pooler
// (SET ROLE на Supabase рвёт соединение — проверяем как приложение).
const base = pgConfig();
const u = new URL(base.connectionString);
u.username = u.username.replace(/^postgres/, "nexus_admin_app");
u.password = password;
const app = new pg.Client({ connectionString: u.toString(), ssl: base.ssl });
await app.connect();
try {
  const ok = await app.query("SELECT count(*) FROM nexus_admin.v_task_fact");
  console.log("view-доступ под ролью: ок,", ok.rows[0].count, "строк");
  // server_checker (раздел «Серверы», SRVCHK-11): гранты выдаёт setup-roles.mjs
  // ТОГО репозитория; здесь probe с guard на свежую БД без схемы (миграция 008)
  try {
    const sc = await app.query("SELECT count(*) FROM server_checker.v_server_overview");
    console.log("server_checker-доступ под ролью: ок,", sc.rows[0].count, "серверов");
  } catch (e) {
    if (e.code === "3F000" || e.code === "42P01") {
      console.log("server_checker: схема ещё не создана — раздел «Серверы» будет пуст (не ошибка)");
    } else if (e.code === "42501") {
      console.error("server_checker: нет прав — прогони setup-roles.mjs в репозитории server_checker");
      process.exitCode = 1;
    } else throw e;
  }
  let denied = 0;
  const scProbes = [];
  try {
    await app.query("SELECT 1 FROM server_checker.metric_snapshot LIMIT 0");
    // схема есть → негативный probe: кабинет НЕ пишет в метрики (только server)
    scProbes.push("INSERT INTO server_checker.metric_snapshot (server_id, collect_ok) VALUES (1, true)");
  } catch { /* схемы нет — probe пропускаем */ }
  for (const probe of [
    "SELECT count(*) FROM public.task",
    "INSERT INTO public.task (project_id) VALUES (1)",
    "UPDATE nexus_admin.sync_meta SET value = 'x' WHERE key = 'last_sync_at'",
    ...scProbes,
  ]) {
    try {
      await app.query(probe);
      console.error("ДЫРА: разрешено →", probe);
      process.exitCode = 1;
    } catch (e) {
      // считаем закрытым ТОЛЬКО отказ в правах; FK/констрейнт = false green (ревью 3.2)
      if (e.code === "42501") denied++;
      else {
        console.error(`не privilege-отказ (${e.code}) →`, probe);
        process.exitCode = 1;
      }
    }
  }
  console.log(`границы: ${denied}/${3 + scProbes.length} запрещённых операций отклонено`);
} finally {
  await app.end();
}
