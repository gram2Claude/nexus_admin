# Деплой nexus_admin на VPS

Минимальные требования: Linux VPS 2 vCPU / 2 GB RAM (+swap) / 40 GB, Ubuntu 22.04+.
Адрес боевого стенда и доступы в публичном репозитории не публикуются — они у
координатора проекта. Ниже `<IP>` — адрес сервера, `<IP-Д>` — он же через дефисы
(например 1.2.3.4 → 1-2-3-4).

## Архитектура

- **nexus-admin** — Next.js standalone в Docker (multi-stage, Node 22 alpine, non-root),
  наружу не торчит (`expose: 3000`), healthcheck на /login.
- **caddy** — реверс-прокси с автоматическим Let's Encrypt; адрес без домена через
  sslip.io (`<IP-Д>.sslip.io` → IP). HTTP→HTTPS редирект из коробки, HSTS включён.
  Access-log намеренно выключен (в query /set-password — одноразовые инвайт-токены).
- **БД** — облачная Supabase, приложение ходит ограниченной ролью `nexus_admin_app`
  (DATABASE_URL_APP); админский DSN на сервер не попадает. Старт без DATABASE_URL_APP
  или CA-файла — немедленный крэш контейнера (src/instrumentation.ts), не тихий отказ.
- Синки план/факт остаются на машине координатора (Task Scheduler 4×/день) —
  VPS только читает БД.

## Первичная установка

```bash
# swap для сборки (на 2 GB RAM next build не проходит без него)
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

curl -fsSL https://get.docker.com | sh

ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && yes | ufw enable

# ⚠️ до merge эпохи 6 деплой-файлы живут в ветке oleg: добавь `-b oleg`
git clone https://github.com/gram2Claude/nexus_admin.git /opt/nexus_admin
cd /opt/nexus_admin
cp .env.production.example .env.production   # заполнить: DATABASE_URL_APP, AUTH_SECRET (openssl rand -hex 48), AUTH_URL
cp Caddyfile.example Caddyfile               # подставить адрес <IP-Д>.sslip.io
chmod 600 .env.production

docker compose up -d --build
```

## Обновление версии

```bash
cd /opt/nexus_admin && git pull && docker compose up -d --build
docker image prune -f   # dangling-слои прошлых сборок (~сотни МБ на 40 GB диске)
```

## Диагностика

```bash
docker compose ps                      # статусы + health
docker compose logs --tail 50 nexus-admin
docker compose logs --tail 50 caddy   # выпуск сертификата
free -m                                # память/своп
```

## Грабли (поймано при первом деплое)

- `next build` в Docker падал на module-level проверке env (`DATABASE_URL_APP не задан`):
  секретов на этапе сборки нет и не должно быть → инициализация пула БД ленивая
  (src/lib/db.ts), а строгая проверка на старте — в src/instrumentation.ts.
- Сборка на 2 GB RAM без swap убивается OOM — swap обязателен.
- Пароль Owner ротируется при деплое на новый стенд.
- Плавающие теги образов (node:22-alpine, caddy:2) — осознанно: стенд один,
  обновления руками; при росте числа стендов — запинить.
