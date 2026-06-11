// Forward-only мигратор (спека 2.1): применяет migrations/*.sql по порядку,
// журнал — nexus_admin.schema_migrations. Идемпотентен.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { pgConfig } from "./conn.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// session-mode: advisory lock корректно живёт/освобождается с сессией (ревью 3.1)
const client = new pg.Client(pgConfig({ sessionMode: true }));

await client.connect();
try {
  // try-lock: занято → выходим, не виснем (ревью 2.1 + 3.1)
  const lock = await client.query(
    "SELECT pg_try_advisory_lock(hashtext('nexus_admin.migrate')) AS ok"
  );
  if (!lock.rows[0].ok) {
    console.error("Миграции уже выполняются в другом процессе — выход");
    process.exit(2);
  }
  await client.query("CREATE SCHEMA IF NOT EXISTS nexus_admin");
  await client.query(`CREATE TABLE IF NOT EXISTS nexus_admin.schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const applied = new Set(
    (await client.query("SELECT name FROM nexus_admin.schema_migrations")).rows.map((r) => r.name)
  );
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

  for (const f of files) {
    if (applied.has(f)) {
      console.log(`= ${f} (уже применена)`);
      continue;
    }
    const sql = readFileSync(join(root, "migrations", f), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO nexus_admin.schema_migrations(name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log(`+ ${f} применена`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  console.log("Миграции: ок");
} finally {
  await client.end();
}
