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
  const text = description.trim().slice(0, 2000);
  // manual-описание переживает синк и org-memory-сиды (спека 3.1 п.3)
  await db.query(
    `UPDATE nexus_admin.projects
     SET description = $2, description_source = 'manual'
     WHERE id = $1`,
    [projectId, text || null]
  );
  revalidatePath("/projects");
  return {};
}
