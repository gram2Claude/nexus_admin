# Деплой nexus_admin на VPS

Боевой стенд: https://185-221-22-174.sslip.io (WEECERE «Базовый»: 2 vCPU / 2 GB / 40 GB,
Ubuntu 22.04). Доступы — у управленца (`~/.wgp/vps_nexus_admin.txt` на машине координатора).

## Архитектура

- **nexus-admin** — Next.js standalone в Docker (multi-stage, Node 22 alpine, non-root),
  наружу не торчит (`expose: 3000`).
- **caddy** — реверс-прокси с автоматическим Let's Encrypt; адрес без домена через
  sslip.io (`185-221-22-174.sslip.io` → IP). HTTP→HTTPS редирект из коробки.
  Access-log намеренно выключен (в query /set-password — одноразовые инвайт-токены).
- **БД** — облачная Supabase (Франкфурт), приложение ходит ограниченной ролью
  `nexus_admin_app` (DATABASE_URL_APP); админский DSN на сервер не попадает.
- Синки план/факт остаются на Windows-машине координатора (Task Scheduler 4×/день) —
  VPS только читает БД.

## Первичная установка (выполнено 2026-06-11)

```bash
# swap для сборки (на 2 GB RAM next build не проходит без него)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

curl -fsSL https://get.docker.com | sh

ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && yes | ufw enable

git clone https://github.com/gram2Claude/nexus_admin.git /opt/nexus_admin
cd /opt/nexus_admin
cp .env.production.example .env.production   # заполнить: DATABASE_URL_APP, AUTH_SECRET (openssl rand -hex 48), AUTH_URL
cp Caddyfile.example Caddyfile               # подставить адрес 185-221-22-174.sslip.io
chmod 600 .env.production

docker compose up -d --build
```

## Обновление версии

```bash
cd /opt/nexus_admin && git pull && docker compose up -d --build
```

⚠️ Сейчас сервер на ветке `oleg` (эпоха 6 ещё не смержена). После merge:
`git checkout master && git pull origin master && docker compose up -d --build`.

## Диагностика

```bash
docker compose ps                      # статусы контейнеров
docker compose logs --tail 50 nexus-admin
docker compose logs --tail 50 caddy   # выпуск сертификата
free -m                                # память/своп
```

## Грабли (поймано при первом деплое)

- `next build` в Docker падал на module-level проверке env (`DATABASE_URL_APP не задан`):
  секретов на этапе сборки нет и не должно быть → инициализация пула БД ленивая
  (src/lib/db.ts, проверки при первом запросе).
- Сборка на 2 GB RAM без swap убивается OOM — swap обязателен.
- Пароль Owner ротируется при каждом деплое на новый стенд (хранится в `.env.local`
  координатора как OWNER_TEMP_PASSWORD; пользователь меняет при первом входе по желанию).
