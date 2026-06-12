// Первичное наполнение описаний проектов из орг-памяти (cerebro), NEXADM-14.
// Перетирает ТОЛЬКО org-memory/пустые описания; manual-правки кабинета неприкосновенны.
// amo_looker добавлен 2026-06-12 (NEXADM-39, запрос управленца) — из паспорта проекта
// (CLAUDE.md amo_looker), страницы в орг-памяти по-прежнему нет.
import pg from "pg";

import { pgConfig } from "../db/conn.mjs";

const DESCRIPTIONS = {
  nexus_admin:
    "Личный кабинет управленца: план-факт по всем дев-проектам — Гант, drill-down от портфеля до моделей AI, учёт часов, токенов и ≈API-стоимости.",
  timechecker:
    "Учёт реального рабочего времени по output-сигналам (транскрипты AI-агентов, git, статусы задач) — без слежки за ОС. Local-first SQLite → Supabase; дневные метрики, простои, токены и ≈API-стоимость.",
  nexus:
    "Сайт Nexus — лендинг организации (Next.js + three.js): витрина продуктов и внутренних систем.",
  amo_looker:
    "Виджет для amoCRM: кнопка-«глазик» у вложений в ленте сделки/контакта — предпросмотр файла в модалке без скачивания (PDF, картинки, текст, Office-форматы). В составе — converter: серверный сервис для форматов, которые браузер не рендерит. Готовится к публикации в маркетплейсе amoCRM.",
};

const client = new pg.Client(pgConfig());
await client.connect();
try {
  for (const [slug, description] of Object.entries(DESCRIPTIONS)) {
    const r = await client.query(
      `UPDATE nexus_admin.projects
       SET description = $2, description_source = 'org-memory'
       WHERE slug = $1 AND description_source IS DISTINCT FROM 'manual'`,
      [slug, description]
    );
    console.log(`${slug}: ${r.rowCount ? "описание установлено" : "пропущено (manual)"}`);
  }
} finally {
  await client.end();
}
