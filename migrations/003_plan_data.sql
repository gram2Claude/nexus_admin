-- 003: план-данные (зеркала канонов WGP), pricing, membership, sync_meta (спека 3.1, NEXADM-12)

CREATE TABLE IF NOT EXISTS nexus_admin.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  -- описание живёт только в кабинете: org-memory → manual; синк НЕ трогает
  description text,
  description_source text CHECK (description_source IN ('org-memory', 'manual')),
  start_date  date,
  end_date    date,
  global_h    numeric,
  global_ai_h numeric,
  done_h      numeric NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  archived    boolean NOT NULL DEFAULT false,
  synced_at   timestamptz
);

CREATE TABLE IF NOT EXISTS nexus_admin.epochs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES nexus_admin.projects(id) ON DELETE CASCADE,
  ext_id      text NOT NULL,
  name        text NOT NULL,
  description text,
  ord         int,
  start_date  date,
  end_date    date,
  epoch_h     numeric,
  epoch_ai_h  numeric,
  done_h      numeric NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, ext_id)
);

CREATE TABLE IF NOT EXISTS nexus_admin.sprints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epoch_id    uuid NOT NULL REFERENCES nexus_admin.epochs(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES nexus_admin.projects(id) ON DELETE CASCADE,
  ext_id      text NOT NULL,
  name        text NOT NULL,
  ord         int,
  start_date  date,
  end_date    date,
  sprint_h    numeric,
  sprint_ai_h numeric,
  days        int,
  done_h      numeric NOT NULL DEFAULT 0,
  archived    boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, ext_id)
);

CREATE TABLE IF NOT EXISTS nexus_admin.tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_id     uuid NOT NULL REFERENCES nexus_admin.sprints(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES nexus_admin.projects(id) ON DELETE CASCADE,
  ext_id        text NOT NULL,
  -- нейтральный ключ план↔факт (timechecker), напр. NEXADM-12; НЕ plane-uuid
  readable_id   text,
  name          text NOT NULL,
  description   text,
  done_criteria text,
  task_type     text,
  status        text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  done_at       date,
  estimate_h    numeric,
  ai_estimate_h numeric,
  realistic_h   numeric,
  pessimistic_h numeric,
  assignee      text,
  archived      boolean NOT NULL DEFAULT false,
  UNIQUE (project_id, ext_id)
);
CREATE INDEX IF NOT EXISTS ix_tasks_readable ON nexus_admin.tasks(readable_id);

-- ставки моделей $/Mtok: input, output, cache_write, cache_creation — из ~/.wgp/pricing.json
CREATE TABLE IF NOT EXISTS nexus_admin.pricing (
  model           text PRIMARY KEY,
  input_usd       numeric NOT NULL,
  output_usd      numeric NOT NULL,
  cache_write_usd numeric NOT NULL DEFAULT 0,
  cache_read_usd  numeric NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- участие в проекте (видимость Employee, t28)
CREATE TABLE IF NOT EXISTS nexus_admin.project_members (
  project_id uuid NOT NULL REFERENCES nexus_admin.projects(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES nexus_admin.users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS nexus_admin.sync_meta (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
