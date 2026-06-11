# Двойное ревью кода эпохи 6 (NEXADM-30,31,32 — деплой) — итоги триажа

Дата: 2026-06-11. Ревьюеры: Claude-субагент + codex (high). Объект: коммиты `2e3bf2d`
(Docker-инфраструктура), `1456f19`+`f435ad8` (ленивый пул БД), `0da6a21` (DEPLOY.md).
Вердикт обоих: реальных дыр безопасности в рантайме нет; находки — про
воспроизводимость и наблюдаемость отказов. Всё применено в `bf7eef5`.

## Применено (8 правок)

| # | Находка | Кто | Правка |
|---|---|---|---|
| 1 | **.env.production.example не попал в репозиторий** (перехвачен `.env*` в gitignore) — установка с нуля по DEPLOY.md падает на cp | субагент MED | `!.env.production.example` + файл закоммичен |
| 2 | **Тихий отказ конфигурации**: контейнер без DATABASE_URL_APP выглядит «Up», 500 всплывает на первом запросе пользователя | оба (MED/P2) | src/instrumentation.ts — строгая проверка env+CA на старте production (по докам Next 16: выполняется при `next start`, не при build) + healthcheck в compose (wget /login) |
| 3 | Pool без обработчика `error` — обрыв idle-соединения до облачного pooler'а ронял бы процесс | субагент LOW | `pool.on("error", …)` в makePool |
| 4 | Широкий build-context: scripts/, живой Caddyfile VPS попадали в контекст/кэш сборки | codex P2 | .dockerignore: scripts, Caddyfile*, migrations |
| 5 | Нет HSTS при 30-дневном auth-cookie | субагент LOW | header в Caddyfile.example + на живом Caddyfile VPS |
| 6 | DEPLOY.md публиковал боевой адрес/профиль VPS в публичном репозитории | субагент INFO | плейсхолдеры `<IP-Д>.sslip.io`; адрес и доступы — только у координатора |
| 7 | Свежий клон по DEPLOY.md даёт master без деплой-файлов (до merge) | оба (LOW/P2) | строка `-b oleg` с пометкой «до merge эпохи 6» |
| 8 | dangling-образы после каждой пересборки (~сотни МБ на 40 GB) | субагент LOW | `docker image prune -f` в секции обновления |

## Принято как ограничение (документировано в DEPLOY.md)

- Плавающие теги образов (node:22-alpine, caddy:2) — стенд один, обновления руками.
- Файлы в образе root-owned при non-root юзере — безопасно, пока нет next/image и ISR
  (проверено: не используются); при появлении понадобится writable .next/cache.

## Чисто (проверено обоими)

Dockerfile non-root корректен, в финальный образ попадают только standalone/static/
public/certs; 3000 не публикуется (только через Caddy); .env.production через env_file
(не запекается в образ), chmod 600; **Auth.js v5 за Caddy корректен без AUTH_TRUST_HOST**
(проверено по коду @auth/core: AUTH_URL ⇒ trustHost, канонический origin запинен,
__Secure-cookie); ленивый getPool без гонки (синхронный, один Node-процесс в standalone);
ufw 22/80/443; порядок ufw allow → enable не отрезает SSH; грабли в DEPLOY.md реальны.

## Верификация

build ✓ lint ✓ · прод пересобран с правками; смоук: HSTS-заголовок, вход Owner (302),
/projects 200 — см. итоговый рапорт. Стенд жил во время пересборки (старый контейнер
обслуживал до подмены).
