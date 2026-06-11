"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { consumeInvite } from "@/lib/invites";

export async function setPassword(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const token = String(formData.get("token") ?? "");
  const p1 = String(formData.get("password") ?? "");
  const p2 = String(formData.get("password2") ?? "");

  if (p1.length < 8) return "Пароль — минимум 8 символов";
  if (p1 !== p2) return "Пароли не совпадают";

  const email = await consumeInvite(token, p1);
  if (!email) return "Ссылка недействительна, запросите новое приглашение";

  try {
    await signIn("credentials", { email, password: p1, redirectTo: "/projects" });
    return undefined;
  } catch (e) {
    if (e instanceof AuthError) return "Пароль сохранён — войдите через страницу входа";
    throw e; // NEXT_REDIRECT после успешного логина
  }
}
