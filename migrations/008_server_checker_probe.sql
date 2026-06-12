-- 008: probe доступа к схеме server_checker (раздел «Серверы», SRVCHK-11).
-- ЕДИНСТВЕННЫЙ владелец схемы и грантов — репозиторий server_checker
-- (scripts/db/setup-roles.mjs там); здесь ТОЛЬКО проверка с guard на свежую БД,
-- где схема ещё не создана (итог ревью плана server_checker: не дублировать
-- ответственность за гранты между двумя репозиториями).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'server_checker') THEN
    IF NOT has_schema_privilege('nexus_admin_app', 'server_checker', 'USAGE') THEN
      RAISE WARNING 'nexus_admin_app не имеет USAGE на server_checker — прогони setup-roles.mjs в репозитории server_checker';
    ELSE
      RAISE NOTICE 'server_checker: доступ кабинета на месте';
    END IF;
  ELSE
    RAISE NOTICE 'Схема server_checker отсутствует — раздел «Серверы» покажет пустое состояние до её миграций (порядок: сначала server_checker, затем кабинет — OPERATIONS.md server_checker)';
  END IF;
END $$;
