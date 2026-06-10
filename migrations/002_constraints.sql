-- 002: ограничения по двойному ревью спринта 2.1 (субагент + codex)

-- Единственность Owner закреплена в БД (а не только в seed-скрипте)
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_single_owner
  ON nexus_admin.users(role) WHERE role = 'owner';

-- Email хранится только в нижнем регистре (authorize/seed lower-кейсят;
-- будущий инвайт-флоу не сможет создать дубль в другом регистре)
ALTER TABLE nexus_admin.users
  ADD CONSTRAINT ck_users_email_lower CHECK (email = lower(email));

-- Удаление автора инвайта не должно падать на FK
ALTER TABLE nexus_admin.invites
  DROP CONSTRAINT invites_created_by_fkey;
ALTER TABLE nexus_admin.invites
  ADD CONSTRAINT invites_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES nexus_admin.users(id) ON DELETE SET NULL;
