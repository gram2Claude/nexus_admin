// Seed первого Owner — вариант B спеки 2.1: временный пароль из env.
// Идемпотентен: если owner уже существует — ничего не делает.
import bcrypt from "bcryptjs";
import pg from "pg";

import { pgConfig } from "./conn.mjs";

const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_TEMP_PASSWORD;
if (!email || !password) {
  console.error("Нужны env: OWNER_EMAIL, OWNER_TEMP_PASSWORD");
  process.exit(1);
}

const client = new pg.Client(pgConfig());

await client.connect();
try {
  const existing = await client.query("SELECT email FROM nexus_admin.users WHERE role = 'owner' LIMIT 1");
  if (existing.rows.length) {
    console.log(`Owner уже существует (${existing.rows[0].email}) — seed пропущен`);
  } else {
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO nexus_admin.users (email, name, role, password_hash, status)
       VALUES ($1, $2, 'owner', $3, 'active')`,
      [email.toLowerCase(), "Олег", hash]
    );
    console.log(`Owner создан: ${email} (пароль — из env OWNER_TEMP_PASSWORD)`);
  }
} finally {
  await client.end();
}
