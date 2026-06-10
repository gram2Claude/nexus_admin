-- 001: схема кабинета, пользователи, инвайты (спека 2.1, NEXADM-5)
CREATE SCHEMA IF NOT EXISTS nexus_admin;

CREATE TABLE IF NOT EXISTS nexus_admin.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text,
  role          text NOT NULL CHECK (role IN ('owner', 'admin', 'employee', 'client')),
  password_hash text,
  status        text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nexus_admin.invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'employee', 'client')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_by uuid REFERENCES nexus_admin.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_invites_email ON nexus_admin.invites(email);
