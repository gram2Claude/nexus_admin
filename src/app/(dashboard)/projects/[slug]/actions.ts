"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { modelFactsByTask, type ModelFact } from "@/server/fact";

/** Разбивка задачи по моделям — только для ролей с правом на затраты (матрица). */
export async function getTaskModels(
  readableId: string
): Promise<{ error?: string; models?: ModelFact[] }> {
  const session = await auth();
  if (!session?.user || !can.seeCosts(session.user.role)) {
    return { error: "Недостаточно прав" };
  }
  if (!/^[A-Z]+-\d+$/.test(readableId)) return { error: "Некорректный ID задачи" };
  return { models: await modelFactsByTask(readableId) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireMembershipManager() {
  const session = await auth();
  if (!session?.user || !can.manageMembership(session.user.role)) {
    throw new Error("Недостаточно прав");
  }
  return session.user;
}

export async function addMember(
  projectId: string,
  userId: string
): Promise<{ error?: string }> {
  await requireMembershipManager();
  if (!UUID_RE.test(projectId) || !UUID_RE.test(userId)) return { error: "Некорректный id" };
  await db.query(
    `INSERT INTO nexus_admin.project_members (project_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [projectId, userId]
  );
  revalidatePath("/projects");
  return {};
}

export async function removeMember(
  projectId: string,
  userId: string
): Promise<{ error?: string }> {
  await requireMembershipManager();
  if (!UUID_RE.test(projectId) || !UUID_RE.test(userId)) return { error: "Некорректный id" };
  await db.query(
    "DELETE FROM nexus_admin.project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  revalidatePath("/projects");
  return {};
}
