import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { epochFactRollupAll, projectFactRollupAll } from "@/server/fact";

import { ProjectsOverview, type ProjectVM } from "./projects-overview";

type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "completed";
  done_h: number;
  global_h: number | null;
  start_date: string | null;
  end_date: string | null;
};

type EpochRow = {
  project_slug: string;
  ext_id: string;
  name: string;
  description: string | null;
  ord: number;
  start_date: string | null;
  end_date: string | null;
  epoch_h: number | null;
  done_h: number;
};

export default async function ProjectsPage() {
  const session = await auth();
  const role = session?.user?.role ?? "client";
  const canSeeCosts = can.seeCosts(role);

  // Employee увидит только свои проекты с membership (NEXADM-28, эпоха 5); до тех пор — все.
  // Client по матрице прав не видит проекты вообще (ревью эпохи 4).
  if (role === "client") {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Доступ к проектам для роли Client настраивается отдельно.
      </p>
    );
  }

  // Факт-роллапы НЕ запрашиваются без права seeCosts: иначе стоимости сериализуются
  // в client-payload и матрица прав обходится через исходник страницы (ревью эпохи 4, P1)
  const [{ rows: projects }, { rows: epochs }, epochFacts, projectFacts] = await Promise.all([
    db.query<ProjectRow>(
      `SELECT id, slug, name, description, status, done_h::float8 AS done_h,
              global_h::float8 AS global_h, start_date::text, end_date::text
       FROM nexus_admin.projects WHERE NOT archived ORDER BY status, slug`
    ),
    db.query<EpochRow>(
      `SELECT p.slug AS project_slug, e.ext_id, e.name, e.description, e.ord,
              e.start_date::text, e.end_date::text, e.epoch_h::float8 AS epoch_h,
              e.done_h::float8 AS done_h
       FROM nexus_admin.epochs e
       JOIN nexus_admin.projects p ON p.id = e.project_id
       WHERE NOT e.archived AND NOT p.archived
       ORDER BY p.slug, e.ord`
    ),
    canSeeCosts ? epochFactRollupAll() : Promise.resolve([]),
    canSeeCosts ? projectFactRollupAll() : Promise.resolve([]),
  ]);

  const epochFactMap = new Map(
    epochFacts.map((f) => [`${f.project_slug}:${f.epoch_ext_id}`, f])
  );
  const projectFactMap = new Map(projectFacts.map((f) => [f.project_slug, f]));

  const vms: ProjectVM[] = projects.map((p) => {
    const pf = projectFactMap.get(p.slug);
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      status: p.status,
      doneH: p.done_h,
      globalH: p.global_h,
      startDate: p.start_date,
      endDate: p.end_date,
      fact: pf
        ? { hours: pf.fact_minutes / 60, tokens: pf.tokens, costUsd: pf.cost_usd }
        : null,
      epochs: epochs
        .filter((e) => e.project_slug === p.slug)
        .map((e) => {
          const f = epochFactMap.get(`${p.slug}:${e.ext_id}`);
          return {
            extId: e.ext_id,
            name: e.name,
            description: e.description,
            startDate: e.start_date,
            endDate: e.end_date,
            planH: e.epoch_h,
            doneH: e.done_h,
            fact: f
              ? { hours: f.fact_minutes / 60, tokens: f.tokens, costUsd: f.cost_usd }
              : null,
          };
        }),
    };
  });

  return (
    <ProjectsOverview
      projects={vms}
      canEdit={can.editProjectMeta(role)}
      canSeeCosts={canSeeCosts}
      todayIso={new Date().toISOString().slice(0, 10)}
    />
  );
}
