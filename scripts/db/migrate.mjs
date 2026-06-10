// Forward-only мигратор (спека 2.1): применяет migrations/*.sql по порядку,
// журнал — nexus_admin.schema_migrations. Идемпотентен.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL не задан (env / .env.local)");
  process.exit(1);
}

// sslmode в строке перебивает явную ssl-опцию pg — вырезаем и задаём ssl сами
const cleanUrl = url.replace(/[?&]sslmode=[^&]+/, "");
const client = new pg.Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
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
