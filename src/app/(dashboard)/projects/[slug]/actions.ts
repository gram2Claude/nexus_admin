"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { modelFactsByTask, type ModelFact } from "@/server/fact";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9_-]+$/;

/** Разбивка задачи по моделям — только для ролей с правом на затраты (матрица).
 *  Скоуп по slug: readable_id не уникален между проектами (ревью эпохи 5). */
export async function getTaskModels(
  readableId: string,
  projectSlug: string
): Promise<{ error?: string; models?: ModelFact[] }> {
  const session = await auth();
  if (!session?.user || !can.seeCosts(session.user.role)) {
    return { error: "Недостаточно прав" };
  }
  // префикс может содержать цифры (напр. WEB3-12) — ревью эпохи 5
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(readableId)) return { error: "Некорректный ID задачи" };
  if (!SLUG_RE.test(projectSlug)) return { error: "Некорректный проект" };
  return { models: await modelFactsByTask(readableId, projectSlug) };
}

async function membershipManager() {
  const session = await auth();
  if (!session?.user || !can.manageMembership(session.user.role)) return null;
  return session.user;
}

async function projectExists(projectId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT 1 FROM nexus_admin.projects WHERE id = $1 AND NOT archived",
    [projectId]
  );
  return !!rows[0];
}

export async function addMember(
  projectId: string,
  userId: string,
  slug: string
): Promise<{ error?: string }> {
  // единый контракт ошибок {error} — без throw в client transition (ревью эпохи 5)
  if (!(await membershipManager())) return { error: "Недостаточно прав" };
  if (!UUID_RE.test(projectId) || !UUID_RE.test(userId) || !SLUG_RE.test(slug)) {
    return { error: "Некорректный id" };
  }
  if (!(await projectExists(projectId))) return { error: "Проект не найден" };
  try {
    const r = await db.query(
      `INSERT INTO nexus_admin.project_members (project_id, user_id)
       SELECT $1, u.id FROM nexus_admin.users u
       WHERE u.id = $2 AND u.status = 'active' AND u.role = 'employee'
       ON CONFLICT DO NOTHING`,
      [projectId, userId]
    );
    if (r.rowCount === 0) {
      // уже участник — не ошибка; не-employee/не-active — отказ
      const { rows } = await db.query(
        "SELECT 1 FROM nexus_admin.project_members WHERE project_id = $1 AND user_id = $2",
        [projectId, userId]
      );
      if (!rows[0]) return { error: "Участником может быть активный Employee" };
    }
  } catch {
    return { error: "Не удалось добавить участника" };
  }
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
  return {};
}

export async function removeMember(
  projectId: string,
  userId: string,
  slug: string
): Promise<{ error?: string }> {
  if (!(await membershipManager())) return { error: "Недостаточно прав" };
  if (!UUID_RE.test(projectId) || !UUID_RE.test(userId) || !SLUG_RE.test(slug)) {
    return { error: "Некорректный id" };
  }
  try {
    await db.query(
      "DELETE FROM nexus_admin.project_members WHERE project_id = $1 AND user_id = $2",
      [projectId, userId]
    );
  } catch {
    return { error: "Не удалось удалить участника" };
  }
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
  return {};
}
