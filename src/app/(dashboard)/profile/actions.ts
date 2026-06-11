"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isBlocked, registerFail, resetFails } from "@/lib/login-rate-limit";

export async function updateName(name: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Нет сессии" };
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) return { error: "Имя — от 1 до 60 символов" };
  await db.query(
    "UPDATE nexus_admin.users SET name = $1, updated_at = now() WHERE id = $2",
    [trimmed, session.user.id]
  );
  revalidatePath("/", "layout"); // имя в шапке и в «Исполнителе»
  return {};
}

export async function changePassword(
  current: string,
  next1: string,
  next2: string
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Нет сессии" };

  if (next1.length < 12) return { error: "Новый пароль — минимум 12 символов" };
  if (next1.length > 72) return { error: "Новый пароль — максимум 72 символа" }; // bcrypt
  if (next1 !== next2) return { error: "Новые пароли не совпадают" };

  // rate-limit как на логине: защита от перебора текущего пароля изнутри сессии (спека 08)
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `chpw:${session.user.id}:${ip}`;
  if (isBlocked(key)) return { error: "Слишком много попыток — подождите 15 минут" };

  const { rows } = await db.query(
    "SELECT password_hash FROM nexus_admin.users WHERE id = $1 AND status = 'active'",
    [session.user.id]
  );
  const hash = rows[0]?.password_hash;
  if (!hash || !(await bcrypt.compare(current, hash))) {
    registerFail(key);
    return { error: "Текущий пароль неверен" };
  }
  resetFails(key);

  const newHash = await bcrypt.hash(next1, 12);
  await db.query(
    "UPDATE nexus_admin.users SET password_hash = $1, updated_at = now() WHERE id = $2",
    [newHash, session.user.id]
  );
  return {};
}
