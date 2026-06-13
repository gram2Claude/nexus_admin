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

  // tg_assistant (E11, TIME-73): раздел «Чаты». Кабинет ЧИТАЕТ все 4 таблицы и ПИШЕТ
  // привязки (источник истины, bound_via='cabinet'); дайджесты/темы/журнал кабинет не пишет
  // (их пишет бот ролью tg_assistant_bot). Схему/таблицы владеет timechecker (миграция v6).
  await client.query("GRANT USAGE ON SCHEMA tg_assistant TO nexus_admin_app");
  // Набор АВТОРИТЕТНЫЙ: REVOKE ALL (таблицы + sequences) снимает любые прежние/ручные лишние
  // права роли, затем выдаём ровно нужное — ре-ран не оставит лишних INSERT/UPDATE/DELETE
  // (ревью codex). Per-table SELECT (НЕ "ON ALL TABLES"): tg_assistant — чужая схема (владелец
  // timechecker), не авто-наследуем будущие таблицы бота. На sequence журнала кабинету ничего
  // не нужно (он не пишет journal).
  await client.query("REVOKE ALL ON ALL TABLES IN SCHEMA tg_assistant FROM nexus_admin_app");
  await client.query("REVOKE ALL ON ALL SEQUENCES IN SCHEMA tg_assistant FROM nexus_admin_app");
  await client.query(
    "GRANT SELECT ON tg_assistant.tg_chat_bindings, tg_assistant.tg_digests, " +
      "tg_assistant.tg_topics, tg_assistant.tg_journal TO nexus_admin_app"
  );
  await client.query(
    "GRANT INSERT, UPDATE ON tg_assistant.tg_chat_bindings TO nexus_admin_app"
  );
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
  // E11: кабинет читает tg_assistant (раздел «Чаты»)
  const okChats = await app.query("SELECT count(*) FROM tg_assistant.tg_chat_bindings");
  console.log("tg_assistant чтение под ролью: ок,", okChats.rows[0].count, "привязок");
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
  // E11: кабинет НЕ пишет дайджесты/темы/журнал (их пишет бот) и НЕ удаляет привязки
  // (unbind = UPDATE project_slug=NULL). Пробы по периметру всех 4 таблиц.
  const tgProbes = [
    "INSERT INTO tg_assistant.tg_digests (project_slug, date, content_md) VALUES ('x', '2026-01-01', 'x')",
    "UPDATE tg_assistant.tg_topics SET content_md = 'x' WHERE project_slug = '__no_such__'",
    "INSERT INTO tg_assistant.tg_journal (project_slug, kind, date, text, norm_text) VALUES ('x','decision','2026-01-01','x','x')",
    "DELETE FROM tg_assistant.tg_chat_bindings WHERE chat_id = -1",
  ];
  const probes = [
    "SELECT count(*) FROM public.task",
    "INSERT INTO public.task (project_id) VALUES (1)",
    "UPDATE nexus_admin.sync_meta SET value = 'x' WHERE key = 'last_sync_at'",
    ...scProbes,
    ...tgProbes,
  ];
  for (const probe of probes) {
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
  console.log(`границы: ${denied}/${probes.length} запрещённых операций отклонено`);
} finally {
  await app.end();
}
