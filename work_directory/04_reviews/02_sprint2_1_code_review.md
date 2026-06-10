# Двойное ревью кода спринта 2.1 (NEXADM-5…7) — итоги триажа

Дата: 2026-06-11. Ревьюеры: Claude-субагент (read-only) + codex (read-only, high reasoning), независимо.
Объект: коммит `b995ca4` (БД кабинета, Auth.js, RBAC). Правки применены коммитом `(см. ниже)`.

## Совпавшие находки (оба ревьюера) — все применены

| # | Находка | Правка |
|---|---|---|
| 1 | **Timing-based user enumeration**: bcrypt только для существующих юзеров — несуществующий email отвечает мгновенно | холостой `bcrypt.compare` с DUMMY_HASH для всех отказов — единое время ответа |
| 2 | **Нет rate-limit**: брутфорс на публичном IP ничем не ограничен + каждый запрос жжёт CPU (bcryptjs) | in-memory лимитер per-email: 5 неудач → блок 15 мин (`src/lib/login-rate-limit.ts`); на VPS дополнится nginx limit_req |
| 3 | **TLS до БД без проверки** (`rejectUnauthorized: false`, 3 места): MITM до Supabase читает креды и хэши | запинен CA Supabase (intermediate+root, снят с живого эндпоинта, TOFU) — `certs/supabase-ca.crt`; конфиг централизован (`scripts/db/conn.mjs` + `src/lib/db.ts`); без CA-файла — честный fail |
| 4 | **30-дневный JWT-cookie поверх HTTP по IP** [codex P1]: перехват = сессия на месяц | срок сессии оставлен (решение управленца), но в канон t31 вписано ЖЁСТКОЕ требование: HTTPS с первого дня деплоя (Caddy + sslip.io / self-signed), критерий готовности t31 обновлён |

## Находки субагента — применены

| # | Находка | Правка |
|---|---|---|
| 5 | `AUTH_TRUST_HOST=true` → host-header open redirect на VPS | заменён на явный `AUTH_URL` (dev: localhost:3100; на VPS задать `AUTH_URL=https://<адрес>`) |
| 6 | Роль/статус заморожены в JWT на 30 дней: disabled-юзер ходит месяц | jwt-callback перепроверяет role/status из БД раз в 10 мин; disabled → сессия гаснет; proxy переведён на полный auth (Node-рантайм Next 16 это позволяет), чтобы обновления токена персистились в cookie |
| 7 | Regex вырезания sslmode ломает URL с несколькими query-параметрами | везде `new URL()` + `searchParams.delete("sslmode")` |
| 8 | `DATABASE_URL ?? ""` → молчаливое подключение к localhost | fail-fast throw на module-scope |
| 9 | `AuthError` ловил и инфраструктурные сбои («упала БД» → «неверный пароль») | различение: `CredentialsSignin` → «Неверный email или пароль», остальное → «Сервис временно недоступен» |
| 10 | `redirectTo` захардкожен — deep-link терялся | callbackUrl прокинут через форму; берётся только pathname+search (host отбрасывается — open redirect невозможен); проверено смоуком: /styleguide → login → /styleguide |
| 11 | Единственность Owner не в БД; email case-sensitive; FK инвайтов без ON DELETE | миграция `002_constraints.sql`: unique partial index на owner, CHECK lower(email), ON DELETE SET NULL — применена |
| 12 | Нет advisory lock в миграторе | `pg_advisory_lock` добавлен |
| 13 | public/-ассеты редиректились на /login | matcher исключает `*.svg/png/ico/txt/xml/webmanifest…` |
| 14 | Комментарии вводили в заблуждение (edge-split, updateAge при JWT) | поправлены |

## Отклонено (с причинами)

| Находка | Кто | Почему отклонено |
|---|---|---|
| bcryptjs → нативный bcrypt / снизить cost 12→10 | субагент minor | нативный bcrypt — трение сборки на Windows-dev и в Docker; DoS-вектор закрыт rate-limit'ом (правка 2); cost 12 оставлен как более стойкий |
| Сократить сессию 30 дней до HTTPS | codex P1 (часть) | срок — решение управленца; риск закрыт требованием HTTPS в t31 (правка 4) — деплой без TLS теперь не пройдёт приёмку |
| /api/* должен отдавать 401 JSON, не 302 | субагент minor | других API пока нет; вернёмся в эпохе 3 при появлении data-роутов |
| `/set-password` открыт заранее | субагент minor | страница придёт в t10 (спринт 2.2) с токен-проверкой — заложено в её done-критерии |

## Чисто (проверено обоими)

SQL-инъекции (всё параметризовано), утечка password_hash (не покидает authorize), секреты вне git
(вся история проверена), CSRF server actions (same-origin Next), NEXT_REDIRECT-проброс, RBAC = матрица
спеки, guard'ы трёхслойные (proxy → layout → page), идемпотентность migrate/seed, CVE-2025-29927 неприменима.

## Верификация после правок

`npm run build` ✓ · `npm run lint` ✓ · миграция 002 применена к Supabase ✓ · смоук: редирект
неавторизованного ✓, неверный пароль → корректная ошибка ✓, вход ✓, deep-link через callbackUrl ✓.
