import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, type Role } from "@/lib/rbac";
import {
  epochFactRollupAll,
  sprintFactRollup,
  taskFactsByProject,
  unplannedTasksByProject,
  type UnplannedTask,
} from "@/server/fact";

import { Drilldown, type DrilldownVM, type TaskVM } from "./drilldown";

export default async function ProjectDrilldownPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role as Role;
  if (role === "client") redirect("/projects");
  const canSeeCosts = can.seeCosts(role);

  const { rows: projRows } = await db.query(
    `SELECT id, slug, name, description, status, done_h::float8 AS done_h,
            global_h::float8 AS global_h
     FROM nexus_admin.projects WHERE slug = $1 AND NOT archived`,
    [slug]
  );
  const project = projRows[0];
  if (!project) notFound();

  // Employee — только участники проекта (t28, server-side).
  // notFound, не redirect: иначе по разнице ответов можно перечислять slug'и (ревью эпохи 5)
  if (role === "employee") {
    const { rows } = await db.query(
      "SELECT 1 FROM nexus_admin.project_members WHERE project_id = $1 AND user_id = $2",
      [project.id, session.user.id]
    );
    if (!rows[0]) notFound();
  }

  const [
    { rows: epochs },
    { rows: sprints },
    { rows: tasks },
    taskFacts,
    epochFacts,
    sprintFacts,
    unplanned,
  ] = await Promise.all([
      db.query(
        `SELECT ext_id, name, description, ord, start_date::text, end_date::text,
                epoch_h::float8 AS epoch_h, done_h::float8 AS done_h
         FROM nexus_admin.epochs WHERE project_id = $1 AND NOT archived ORDER BY ord`,
        [project.id]
      ),
      db.query(
        `SELECT s.ext_id, s.name, s.ord, s.start_date::text, s.end_date::text,
                s.sprint_h::float8 AS sprint_h, s.done_h::float8 AS done_h,
                e.ext_id AS epoch_ext_id
         FROM nexus_admin.sprints s JOIN nexus_admin.epochs e ON e.id = s.epoch_id
         WHERE s.project_id = $1 AND NOT s.archived ORDER BY s.ord`,
        [project.id]
      ),
      db.query(
        `SELECT t.ext_id, t.readable_id, t.name, t.task_type, t.status,
                t.estimate_h::float8 AS estimate_h, t.assignee, s.ext_id AS sprint_ext_id
         FROM nexus_admin.tasks t JOIN nexus_admin.sprints s ON s.id = t.sprint_id
         WHERE t.project_id = $1 AND NOT t.archived ORDER BY t.ext_id`,
        [project.id]
      ),
      canSeeCosts ? taskFactsByProject(slug) : Promise.resolve([]),
      canSeeCosts ? epochFactRollupAll() : Promise.resolve([]),
      canSeeCosts ? sprintFactRollup(slug) : Promise.resolve(new Map()),
      // список «прочих» видят все роли проекта; затраты фильтруются при сборке VM
      unplannedTasksByProject(slug),
    ]);

  const tf = new Map(taskFacts.map((f) => [f.readable_id, f]));
  const ef = new Map(
    epochFacts.filter((f) => f.project_slug === slug).map((f) => [f.epoch_ext_id, f])
  );

  // участники + кандидаты — ТОЛЬКО для Owner/Admin: иначе список (UUID+имена/email)
  // сериализуется в payload employee (ревью эпохи 5, тот же анти-паттерн что с затратами)
  const canManageMembers = can.manageMembership(role);
  const emptyRows = Promise.resolve({ rows: [] as { id: string; label: string }[] });
  const [{ rows: members }, { rows: allUsers }] = await Promise.all([
    canManageMembers
      ? db.query(
          `SELECT u.id, COALESCE(u.name, u.email) AS label
           FROM nexus_admin.project_members pm JOIN nexus_admin.users u ON u.id = pm.user_id
           WHERE pm.project_id = $1 ORDER BY label`,
          [project.id]
        )
      : emptyRows,
    canManageMembers
      ? db.query(
          // кандидаты — активные Employee (матрица: членство имеет смысл для них)
          `SELECT id, COALESCE(name, email) AS label FROM nexus_admin.users
           WHERE status = 'active' AND role = 'employee' ORDER BY label`
        )
      : emptyRows,
  ]);

  const statusOf = (list: { status: string }[]): "done" | "wip" | "todo" => {
    if (list.length && list.every((t) => t.status === "done")) return "done";
    if (list.some((t) => t.status !== "todo")) return "wip";
    return "todo";
  };

  // канонные misc-задачи («Прочие работы», IT2) поглощаются узлом спринта:
  // их план — бюджет узла, отдельной строкой в таблице задач они не дублируются
  const planTasks = tasks.filter((t) => t.task_type !== "misc");
  const toUnplannedVM = (u: UnplannedTask): TaskVM => ({
    readableId: u.readable_id,
    name: u.title ?? u.readable_id,
    taskType: "misc",
    status: u.status,
    planH: u.estimate_h,
    // executor — производное от факта (daily_task_time): для employee скрываем,
    // симметрично плановым задачам, где факт-исполнитель виден только с затратами
    executor: canSeeCosts ? u.executor : null,
    fact: canSeeCosts
      ? { hours: u.fact_minutes / 60, tokens: u.tokens, costUsd: u.cost_usd }
      : null,
  });
  const sprintIds = new Set(sprints.map((s) => s.ext_id));
  const miscOrphans = unplanned
    .filter((u) => !u.sprint_ext_id || !sprintIds.has(u.sprint_ext_id))
    .map(toUnplannedVM);

  const vm: DrilldownVM = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    description: project.description,
    status: project.status,
    doneH: project.done_h,
    globalH: project.global_h,
    // факт проекта = ВСЕ строки v_task_fact слага (включая задачи вне дерева кабинета) —
    // самое честное «итого потрачено»; при нуле фактов — null, не {0,0,0} (ревью эпохи 5)
    fact:
      canSeeCosts && tf.size > 0
        ? [...tf.values()].reduce(
            (a, f) => ({
              hours: a.hours + f.fact_minutes / 60,
              tokens: a.tokens + f.tokens,
              costUsd: a.costUsd + f.cost_usd,
            }),
            { hours: 0, tokens: 0, costUsd: 0 }
          )
        : null,
    miscOrphans,
    epochs: epochs.map((e) => {
      const eTasks = planTasks.filter((t) =>
        sprints.some((s) => s.epoch_ext_id === e.ext_id && s.ext_id === t.sprint_ext_id)
      );
      const f = ef.get(e.ext_id);
      return {
        extId: e.ext_id,
        name: e.name,
        description: e.description,
        startDate: e.start_date,
        endDate: e.end_date,
        planH: e.epoch_h,
        doneH: e.done_h,
        status: statusOf(eTasks),
        fact:
          canSeeCosts && f
            ? { hours: f.fact_minutes / 60, tokens: f.tokens, costUsd: f.cost_usd }
            : null,
        sprints: sprints
          .filter((s) => s.epoch_ext_id === e.ext_id)
          .map((s) => {
            const sTasks = planTasks.filter((t) => t.sprint_ext_id === s.ext_id);
            // sprint-факт из roll-up (включая архивные задачи) — единообразно
            // с уровнями эпохи/проекта (ревью эпохи 5)
            const sf = sprintFacts.get(s.ext_id);
            const sFact =
              canSeeCosts && sf
                ? { hours: sf.fact_minutes / 60, tokens: sf.tokens, costUsd: sf.cost_usd }
                : null;
            // узел «Прочие работы»: план — бюджет канонной misc-задачи (если есть),
            // наполнение — внеплановые задачи реестра, привязанные к спринту
            const miscBudget = tasks.find(
              (t) => t.sprint_ext_id === s.ext_id && t.task_type === "misc"
            );
            const sprintUnplanned = unplanned.filter((u) => u.sprint_ext_id === s.ext_id);
            const misc =
              miscBudget || sprintUnplanned.length
                ? {
                    planH: miscBudget?.estimate_h ?? null,
                    fact:
                      canSeeCosts && sprintUnplanned.length
                        ? sprintUnplanned.reduce(
                            (a, u) => ({
                              hours: a.hours + u.fact_minutes / 60,
                              tokens: a.tokens + u.tokens,
                              costUsd: a.costUsd + u.cost_usd,
                            }),
                            { hours: 0, tokens: 0, costUsd: 0 }
                          )
                        : null,
                    tasks: sprintUnplanned.map(toUnplannedVM),
                  }
                : null;
            return {
              extId: s.ext_id,
              name: s.name,
              startDate: s.start_date,
              endDate: s.end_date,
              planH: s.sprint_h,
              doneH: s.done_h,
              status: statusOf(sTasks),
              fact: sFact,
              misc,
              tasks: sTasks.map((t) => {
                const f2 = t.readable_id ? tf.get(t.readable_id) : undefined;
                return {
                  readableId: t.readable_id,
                  name: t.name,
                  taskType: t.task_type,
                  status: t.status,
                  planH: t.estimate_h,
                  executor: f2?.executor ?? t.assignee ?? null,
                  fact:
                    canSeeCosts && f2
                      ? {
                          hours: f2.fact_minutes / 60,
                          tokens: f2.tokens,
                          costUsd: f2.cost_usd,
                        }
                      : null,
                };
              }),
            };
          }),
      };
    }),
  };

  return (
    <Drilldown
      project={vm}
      canSeeCosts={canSeeCosts}
      canManageMembers={canManageMembers}
      members={members}
      allUsers={allUsers}
    />
  );
}
