import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

import { ProjectsDraftList, type ProjectRow } from "./projects-draft-list";

export default async function ProjectsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "client";

  // Employee увидит только свои проекты с membership (t28, эпоха 5); до тех пор — все
  const { rows } = await db.query<ProjectRow>(
    `SELECT id, slug, name, description, status, done_h::text, global_h::text
     FROM nexus_admin.projects
     WHERE NOT archived
     ORDER BY status, slug`
  );

  return <ProjectsDraftList projects={rows} canEdit={can.editProjectMeta(role)} />;
}
