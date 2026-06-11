-- 004: view-слой факта из timechecker (NEXADM-16/17/18).
-- Доступ приложения — ТОЛЬКО через эти view (owner-цепочка прав);
-- прямых грантов на public.* у роли приложения нет.

-- Факт по задаче: часы из daily_task_time, токены/стоимость из daily_agent_usage,
-- исполнитель = сотрудник с максимумом минут по задаче.
CREATE OR REPLACE VIEW nexus_admin.v_task_fact AS
SELECT
  tt.identifier                  AS readable_id,
  tt.canon_task_id,
  p.slug                         AS project_slug,
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
  -- display_name бывает NULL или '' — падаем на windows_username (ревью 3.2)
  SELECT COALESCE(NULLIF(e.display_name, ''), e.windows_username) AS display_name
  FROM public.daily_task_time d
  JOIN public.employee e ON e.id = d.employee_id
  WHERE d.task_id = tt.id
  GROUP BY COALESCE(NULLIF(e.display_name, ''), e.windows_username)
  ORDER BY SUM(d.active_minutes) DESC
  LIMIT 1
) emp ON true
WHERE tt.identifier IS NOT NULL;

-- Задача × модель AI (приближение, спека 3.2):
-- task_id у сессий timechecker всегда NULL → дневные числа задачи распределяются
-- по моделям пропорционально токен-долям моделей в сессиях того же сотрудника/дня:
--   токены/кэш/стоимость — из daily_agent_usage (точные суммы, доли по source);
--   минуты — из daily_task_time (доли по моделям дня без разреза source — его там нет).
-- Суммы по задаче сходятся с timechecker по построению. Строки с task_id IS NULL —
-- бакет «нераспределённое» уровня портфеля (проекта у них в данных нет).
CREATE OR REPLACE VIEW nexus_admin.v_task_model_fact AS
WITH day_model AS (
  SELECT
    s.employee_id, s.source,
    ((s.started_at)::timestamptz AT TIME ZONE 'Europe/Moscow')::date AS work_date,
    -- '' и '<synthetic>' → 'unknown' (ревью 3.2)
    COALESCE(NULLIF(NULLIF(btrim(s.model), ''), '<synthetic>'), 'unknown') AS model,
    -- веса — только рабочие токены: кэш-чтения доминируют на порядки и искажали бы доли (ревью 3.2)
    SUM(s.tokens_in + s.tokens_out)::numeric AS w_tokens
  FROM public.agent_session s
  WHERE s.started_at IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
day_tot AS (
  SELECT employee_id, source, work_date, SUM(w_tokens) AS tot
  FROM day_model GROUP BY 1, 2, 3
  HAVING SUM(w_tokens) > 0
),
-- LEFT JOIN + fallback-бакет (ревью 3.2, HIGH у обоих ревьюеров): день задачи без
-- подходящих сессий (сессия через полночь, нулевые веса) НЕ теряется — вся строка
-- уходит в model='unknown' с долей 1. Сходимость сумм — теперь по построению.
tok AS (
  SELECT
    d.task_id,
    COALESCE(dm.model, 'unknown') AS model,
    SUM(d.tokens         * COALESCE(dm.w_tokens / dt.tot, 1)) AS tokens,
    SUM(d.cache_read     * COALESCE(dm.w_tokens / dt.tot, 1)) AS cache_read,
    SUM(d.cache_creation * COALESCE(dm.w_tokens / dt.tot, 1)) AS cache_creation,
    SUM(d.cost_usd       * COALESCE(dm.w_tokens / dt.tot, 1)) AS cost_usd
  FROM public.daily_agent_usage d
  LEFT JOIN day_tot dt ON dt.employee_id = d.employee_id AND dt.source = d.source
                      AND dt.work_date = (d.work_date)::date
  LEFT JOIN day_model dm ON dm.employee_id = d.employee_id AND dm.source = d.source
                        AND dm.work_date = (d.work_date)::date
                        AND dt.tot IS NOT NULL
  GROUP BY 1, 2
),
day_model_all AS ( -- доли моделей дня без source — для минут
  SELECT employee_id, work_date, model, SUM(w_tokens) AS w_tokens
  FROM day_model GROUP BY 1, 2, 3
),
day_tot_all AS (
  SELECT employee_id, work_date, SUM(w_tokens) AS tot
  FROM day_model_all GROUP BY 1, 2
  HAVING SUM(w_tokens) > 0
),
-- минуты дней без AI-сессий не теряются (ревью 3.2): бакет 'no-agent';
-- SUM(minutes) по задаче сходится с fact_minutes из v_task_fact по построению
tim AS (
  SELECT
    d.task_id,
    COALESCE(dma.model, 'no-agent') AS model,
    SUM(d.active_minutes * COALESCE(dma.w_tokens / dta.tot, 1)) AS minutes
  FROM public.daily_task_time d
  LEFT JOIN day_tot_all dta ON dta.employee_id = d.employee_id
                           AND dta.work_date = (d.work_date)::date
  LEFT JOIN day_model_all dma ON dma.employee_id = d.employee_id
                             AND dma.work_date = (d.work_date)::date
                             AND dta.tot IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  tt.identifier AS readable_id,
  p.slug        AS project_slug,
  m.model,
  COALESCE(tok.tokens, 0)         AS tokens,
  COALESCE(tok.cache_read, 0)     AS cache_read,
  COALESCE(tok.cache_creation, 0) AS cache_creation,
  COALESCE(tok.cost_usd, 0)       AS cost_usd,
  COALESCE(tim.minutes, 0)        AS minutes
FROM (
  SELECT task_id, model FROM tok
  UNION
  SELECT task_id, model FROM tim
) m
LEFT JOIN tok ON tok.task_id IS NOT DISTINCT FROM m.task_id AND tok.model = m.model
LEFT JOIN tim ON tim.task_id IS NOT DISTINCT FROM m.task_id AND tim.model = m.model
LEFT JOIN public.task tt ON tt.id = m.task_id
LEFT JOIN public.project p ON p.id = tt.project_id;
