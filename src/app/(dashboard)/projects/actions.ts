"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";

export async function updateProjectDescription(
  projectId: string,
  description: string
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user || !can.editProjectMeta(session.user.role)) {
    return { error: "Недостаточно прав" };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    return { error: "Некорректный идентификатор проекта" };
  }
  const text = description.trim().slice(0, 2000);
  // manual-описание переживает синк и org-memory-сиды (спека 3.1 п.3)
  const r = await db.query(
    `UPDATE nexus_admin.projects
     SET description = $2, description_source = 'manual'
     WHERE id = $1`,
    [projectId, text || null]
  );
  if (r.rowCount === 0) return { error: "Проект не найден" };
  revalidatePath("/projects");
  return {};
}
