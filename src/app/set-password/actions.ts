"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { consumeInvite } from "@/lib/invites";
import { isBlocked, registerFail, resetFails } from "@/lib/login-rate-limit";

export async function setPassword(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const token = String(formData.get("token") ?? "");
  const p1 = String(formData.get("password") ?? "");
  const p2 = String(formData.get("password2") ?? "");

  if (p1.length < 12) return "Пароль — минимум 12 символов"; // выровнено с профилем (ревью эпохи 7)
  // предел bcrypt — 72 БАЙТА utf-8, не символа (ревью эпохи 7)
  if (Buffer.byteLength(p1, "utf8") > 72) return "Пароль слишком длинный (максимум 72 байта)";
  if (p1 !== p2) return "Пароли не совпадают";

  // rate-limit per-IP: публичный эндпоинт, перебор токенов (ревью 2.2)
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `setpw:${ip}`;
  if (isBlocked(key)) return "Слишком много попыток — подождите 15 минут";

  const email = await consumeInvite(token, p1);
  if (!email) {
    registerFail(key);
    return "Ссылка недействительна, запросите новое приглашение";
  }
  resetFails(key);

  try {
    await signIn("credentials", { email, password: p1, redirectTo: "/projects" });
    return undefined;
  } catch (e) {
    if (e instanceof AuthError) return "Пароль сохранён — войдите через страницу входа";
    throw e; // NEXT_REDIRECT после успешного логина
  }
}
