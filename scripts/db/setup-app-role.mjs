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
  // Явный per-table SELECT (НЕ "ON ALL TABLES"): tg_assistant — чужая схема (владелец
  // timechecker); кабинет не должен авто-получать чтение на любые будущие таблицы бота.
  // REVOKE сначала — идемпотентно сужает прежний широкий грант (ревью codex).
  await client.query("REVOKE SELECT ON ALL TABLES IN SCHEMA tg_assistant FROM nexus_admin_app");
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
  let denied = 0;
  const probes = [
    "SELECT count(*) FROM public.task",
    "INSERT INTO public.task (project_id) VALUES (1)",
    "UPDATE nexus_admin.sync_meta SET value = 'x' WHERE key = 'last_sync_at'",
    // E11: кабинет НЕ пишет дайджесты (их пишет бот) и НЕ удаляет привязки (unbind = UPDATE)
    "INSERT INTO tg_assistant.tg_digests (project_slug, date, content_md) VALUES ('x', '2026-01-01', 'x')",
    "DELETE FROM tg_assistant.tg_chat_bindings WHERE chat_id = -1",
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
