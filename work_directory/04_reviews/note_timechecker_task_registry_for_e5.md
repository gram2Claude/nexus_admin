# Заметка для e5 (drill-down до задач): собственный реестр задач timechecker

Источник: timechecker, эпоха E9 plane_exit (2026-06-11, master `6d4c82d`, схема v4).
Передаётся тем же каналом, каким нам пришёл `bug_report_timechecker_string_min_ts` (исправлен,
TIME-65 — резолюция в файле репорта). Это вход для NEXADM-25…27, не баг-репорт.

## Что изменилось в реплике (public-схема того же Supabase)

- **Plane выведен полностью.** Задачи и переходы статусов теперь пишет собственный реестр
  timechecker (CLI `timechecker task import/add/start/done`), а не зеркало Plane.
- **Схема v4** (применена 2026-06-11): `plane_transition` → `task_transition`,
  `task.plane_identifier` → `identifier`, `task.plane_issue_id` → `external_uid`,
  `project.identifier_prefix` (бывш. plane_identifier), `project.plane_project_id` удалена.
  Ваша `v_task_fact` уже на новых именах (`tt.identifier`) — совместимо.

## Рекомендации для страницы проекта (NEXADM-25/26) и панели задачи (NEXADM-27)

1. **Живой статус задачи берите из `public.task.status`** (реестр — первоисточник:
   `Todo` / `In Progress` / `Done`), а не только из канонного статуса в `nexus_admin.tasks`:
   канон отстаёт до синка и не знает `In Progress` между гейтами (его пишет только
   `timechecker task start`).
2. **История «в работе»** — `public.task_transition` (`task_id`, `from_state`, `to_state`,
   `ts_utc`, идемпотентный `external_id`). Окно задачи = от перехода в `In Progress` до
   ближайшего `Done` (та же логика, что в метриках timechecker). Таблица НЕ прунится —
   хранится бессрочно, на неё можно опираться исторически.
3. **Join план↔факт** — по `identifier` (формат `PREFIX-N`, например `TIME-55`) или
   `canon_task_id` (id задачи канона, например `t9.1.1`) — оба поля в `public.task`.
4. **Контракты ts**: все `ts_utc` несут офсет (`...Z`); границы `agent_session`
   пересчитаны после вашего баг-репорта (string-min/max исправлен + полный пересбор) —
   данным `started_at`/`ended_at` можно доверять.

## Контакт

Вопросы по семантике реестра — в timechecker: `src/timechecker/tasks.py` (логика),
`docs/RUNBOOK.md` (эксплуатация), вики workspace `13_timechecker/.claude/memory_long/wiki/`
(страницы «Коллекторы», «Модель данных»).
