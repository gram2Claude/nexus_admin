// Seed первого Owner — вариант B спеки 2.1: временный пароль из env.
// Идемпотентен: если owner уже существует — ничего не делает.
import bcrypt from "bcryptjs";
import pg from "pg";

const url = process.env.DATABASE_URL;
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_TEMP_PASSWORD;
if (!url || !email || !password) {
  console.error("Нужны env: DATABASE_URL, OWNER_EMAIL, OWNER_TEMP_PASSWORD");
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
