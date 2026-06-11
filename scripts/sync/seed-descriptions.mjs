// Первичное наполнение описаний проектов из орг-памяти (cerebro), NEXADM-14.
// Перетирает ТОЛЬКО org-memory/пустые описания; manual-правки кабинета неприкосновенны.
// amo_looker намеренно не заполняется — страницы в орг-памяти нет, опишет Owner в UI.
import pg from "pg";

import { pgConfig } from "../db/conn.mjs";

const DESCRIPTIONS = {
  nexus_admin:
    "Личный кабинет управленца: план-факт по всем дев-проектам — Гант, drill-down от портфеля до моделей AI, учёт часов, токенов и ≈API-стоимости.",
  timechecker:
    "Учёт реального рабочего времени по output-сигналам (транскрипты AI-агентов, git, статусы задач) — без слежки за ОС. Local-first SQLite → Supabase; дневные метрики, простои, токены и ≈API-стоимость.",
  nexus:
    "Сайт Nexus — лендинг организации (Next.js + three.js): витрина продуктов и внутренних систем.",
};

const client = new pg.Client(pgConfig());
await client.connect();
try {
  for (const [slug, description] of Object.entries(DESCRIPTIONS)) {
    const r = await client.query(
      `UPDATE nexus_admin.projects
       SET description = $2, description_source = 'org-memory'
       WHERE slug = $1 AND (description IS NULL OR description_source = 'org-memory')`,
      [slug, description]
    );
    console.log(`${slug}: ${r.rowCount ? "описание установлено" : "пропущено (manual)"}`);
  }
} finally {
  await client.end();
}
