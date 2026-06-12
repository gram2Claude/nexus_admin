-- 007: «Прочие работы» (спека 11 timechecker) — view внеплановых задач с фактом.
-- Внеплановая = задача реестра timechecker без привязки к канону (canon_task_id IS NULL);
-- привязка к спринту — public.task.sprint_ext_id (схема v5, заполняет timechecker).
-- Анти-join по nexus_admin.tasks закрывает окно «задачу внесли в канон, sync-plan прошёл,
-- timechecker task import ещё нет» — без него факт задвоился бы в роллапах (ревью плана P2.5).
-- Статус нормализуется к словарю кабинета (todo/in_progress/done) — иначе бейджи
-- показывали бы всё как «в ожидании» (ревью плана P2.6).
-- Грантов нет намеренно: доступ роли приложения даёт владельческая цепочка
-- setup-app-role.mjs (GRANT SELECT ON ALL TABLES + default privileges), как для 004.

CREATE OR REPLACE VIEW nexus_admin.v_unplanned_task_fact AS
SELECT
  tt.identifier                  AS readable_id,
  p.slug                         AS project_slug,
  tt.sprint_ext_id,
  tt.title,
  CASE
    -- cancelled = закрытый статус реестра (_OPEN_EXCLUDES) — не вечное «в ожидании»
    WHEN lower(tt.status) IN ('done', 'completed', 'cancelled', 'canceled') THEN 'done'
    WHEN lower(tt.status) = 'in progress' THEN 'in_progress'
    ELSE 'todo'                  -- Todo / Backlog / неизвестное
  END                            AS status,
  tt.estimate_h,
  COALESCE(tm.minutes, 0)        AS fact_minutes,
  COALESCE(au.tokens, 0)         AS tokens,
  COALESCE(au.cache_read, 0)     AS cache_read,
  COALESCE(au.cache_creation, 0) AS cache_creation,
  COALESCE(au.cost_usd, 0)       AS cost_usd,
  emp.display_name               AS executor
FROM public.task tt
JOIN public.project p ON p.id = tt.project_id
LEFT JOIN (
  SELECT task_id, SUM(active_minutes) AS minutes
  FROM public.daily_task_time GROUP BY task_id
) tm ON tm.task_id = tt.id
LEFT JOIN (
  SELECT task_id, SUM(tokens) AS tokens, SUM(cache_read) AS cache_read,
         SUM(cache_creation) AS cache_creation, SUM(cost_usd) AS cost_usd
  FROM public.daily_agent_usage GROUP BY task_id
) au ON au.task_id = tt.id
LEFT JOIN LATERAL (
  SELECT COALESCE(NULLIF(e.display_name, ''), e.windows_username) AS display_name
  FROM public.daily_task_time d
  JOIN public.employee e ON e.id = d.employee_id
  WHERE d.task_id = tt.id
  GROUP BY COALESCE(NULLIF(e.display_name, ''), e.windows_username)
  ORDER BY SUM(d.active_minutes) DESC
  LIMIT 1
) emp ON true
WHERE tt.identifier IS NOT NULL
  AND tt.canon_task_id IS NULL
  AND NOT EXISTS (
    -- БЕЗ фильтра archived (ревью кода, P1): plan-ветки роллапов считают и архивные
    -- задачи зеркала — archived-строка с тем же readable_id дала бы двойной счёт
    SELECT 1
    FROM nexus_admin.tasks nt
    JOIN nexus_admin.projects np ON np.id = nt.project_id
    WHERE nt.readable_id = tt.identifier AND np.slug = p.slug
  );
