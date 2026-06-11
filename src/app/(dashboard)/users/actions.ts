"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { can, canModifyUser, type Role } from "@/lib/rbac";

const INVITABLE_ROLES = ["admin", "employee", "client"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];

async function requireManager() {
  const session = await auth();
  if (!session?.user || !can.manageUsers(session.user.role)) {
    throw new Error("Недостаточно прав");
  }
  return session.user;
}

export type InviteResult = { error?: string; link?: string; email?: string };

export async function inviteUser(
  _prev: InviteResult | undefined,
  formData: FormData
): Promise<InviteResult> {
  const actor = await requireManager();
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const name = String(formData.get("name") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "") as InvitableRole;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Некорректный email" };
  if (!INVITABLE_ROLES.includes(role)) return { error: "Некорректная роль" };
  if (role === "admin" && !can.assignAdmin(actor.role)) {
    return { error: "Назначать роль Admin может только Owner" };
  }

  try {
    const token = await createInvite(email, name, role, actor.id);
    revalidatePath("/users");
    return { link: `/set-password?token=${token}`, email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось создать приглашение" };
  }
}

export async function reinviteUser(userId: string): Promise<InviteResult> {
  const actor = await requireManager();
  const { rows } = await db.query(
    "SELECT email, name, role, status FROM nexus_admin.users WHERE id = $1",
    [userId]
  );
  const target = rows[0];
  if (!target) return { error: "Пользователь не найден" };
  if (target.status !== "invited") return { error: "Пользователь уже активирован" };
  if (!canModifyUser(actor.role, target.role as Role)) return { error: "Недостаточно прав" };
  if (target.role === "admin" && !can.assignAdmin(actor.role)) {
    return { error: "Перевыпуск инвайта Admin — только Owner" };
  }

  try {
    const token = await createInvite(
      target.email,
      target.name,
      target.role as InvitableRole,
      actor.id
    );
    return { link: `/set-password?token=${token}`, email: target.email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось перевыпустить" };
  }
}

export async function changeRole(userId: string, newRole: string): Promise<{ error?: string }> {
  const actor = await requireManager();
  if (!INVITABLE_ROLES.includes(newRole as InvitableRole)) return { error: "Некорректная роль" };
  if (newRole === "admin" && !can.assignAdmin(actor.role)) {
    return { error: "Назначать роль Admin может только Owner" };
  }
  if (userId === actor.id) return { error: "Свою роль менять нельзя" };

  const { rows } = await db.query("SELECT role FROM nexus_admin.users WHERE id = $1", [userId]);
  const target = rows[0];
  if (!target) return { error: "Пользователь не найден" };
  if (!canModifyUser(actor.role, target.role as Role)) return { error: "Недостаточно прав" };

  await db.query(
    "UPDATE nexus_admin.users SET role = $2, updated_at = now() WHERE id = $1",
    [userId, newRole]
  );
  revalidatePath("/users");
  return {};
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  const actor = await requireManager();
  if (userId === actor.id) return { error: "Нельзя удалить самого себя" };

  const { rows } = await db.query(
    "SELECT email, role FROM nexus_admin.users WHERE id = $1",
    [userId]
  );
  const target = rows[0];
  if (!target) return { error: "Пользователь не найден" };
  if (!canModifyUser(actor.role, target.role as Role)) return { error: "Недостаточно прав" };

  await db.query("DELETE FROM nexus_admin.invites WHERE email = $1", [target.email]);
  await db.query("DELETE FROM nexus_admin.users WHERE id = $1", [userId]);
  revalidatePath("/users");
  return {};
}
