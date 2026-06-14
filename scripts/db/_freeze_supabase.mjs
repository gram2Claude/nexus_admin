// Одноразовый скрипт S12.5/TIME-104: заморозить облачный Supabase в read-only (fallback-freeze).
// НЕ выпиливает Supabase (ревью D5) — только запрещает запись ролям консьюмеров.
// DSN берётся из ~/.wgp/secrets.json -> supabase_db_url_OLD_supabase (облачный admin).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";

const secrets = JSON.parse(readFileSync(join(homedir(), ".wgp", "secrets.json"), "utf8"));
const raw = secrets.supabase_db_url_OLD_supabase;
if (!raw) throw new Error("Нет supabase_db_url_OLD_supabase в secrets.json");
const u = new URL(raw);
u.searchParams.delete("sslmode");
// для ALTER ROLE (каталог) нужен session-режим: Supavisor 6543 -> 5432
if (u.port === "6543") u.port = "5432";

const CONSUMER_ROLES = ["nexus_admin_app", "server_checker_collector", "tg_assistant_bot"];
const apply = process.argv.includes("--apply");

const client = new pg.Client({
  connectionString: u.toString(),
  ssl: { rejectUnauthorized: false }, // одноразовая admin-операция к облачному pooler
  statement_timeout: 20_000,
});

const host = u.hostname;
console.log(`target Supabase host=${host} port=${u.port} db=${u.pathname.slice(1)} mode=${apply ? "APPLY" : "DRY-RUN"}`);
await client.connect();
try {
  // 1) кто ещё подключён к Supabase (должны остаться только админ-сессии — консьюмеры ушли)
  const act = await client.query(
    `select coalesce(usename,'?') usename, count(*) n, max(backend_start)::timestamptz(0) last
       from pg_stat_activity where datname is not null group by 1 order by 2 desc`
  );
  console.log("\n=== активные коннекты к Supabase (по ролям) ===");
  for (const r of act.rows) console.log(`  ${r.usename.padEnd(28)} conns=${r.n} last=${r.last ?? ""}`);

  // 2) какие из ролей консьюмеров существуют + текущий read-only флаг
  const roles = await client.query(
    `select rolname, rolconfig from pg_roles where rolname = any($1::text[])`,
    [CONSUMER_ROLES]
  );
  const present = new Map(roles.rows.map((r) => [r.rolname, r.rolconfig || []]));
  console.log("\n=== роли консьюмеров на Supabase ===");
  for (const role of CONSUMER_ROLES) {
    if (!present.has(role)) { console.log(`  ${role.padEnd(28)} ОТСУТСТВУЕТ (пропуск)`); continue; }
    const ro = (present.get(role) || []).find((c) => c.startsWith("default_transaction_read_only"));
    console.log(`  ${role.padEnd(28)} read_only=${ro ? ro.split("=")[1] : "off"}`);
  }

  // 3) применить freeze
  if (apply) {
    console.log("\n=== APPLY: ALTER ROLE ... SET default_transaction_read_only = on ===");
    for (const role of CONSUMER_ROLES) {
      if (!present.has(role)) continue;
      await client.query(`ALTER ROLE ${client.escapeIdentifier(role)} SET default_transaction_read_only = on`);
      console.log(`  frozen: ${role}`);
    }
    // верификация
    const after = await client.query(
      `select rolname, rolconfig from pg_roles where rolname = any($1::text[])`,
      [CONSUMER_ROLES]
    );
    console.log("\n=== верификация после freeze ===");
    for (const r of after.rows) {
      const ro = (r.rolconfig || []).find((c) => c.startsWith("default_transaction_read_only"));
      console.log(`  ${r.rolname.padEnd(28)} read_only=${ro ? ro.split("=")[1] : "off"}`);
    }
  } else {
    console.log("\n(dry-run: запусти с --apply, чтобы заморозить)");
  }
} finally {
  await client.end();
}
