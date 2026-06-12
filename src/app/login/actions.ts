"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

// Из callbackUrl берём только pathname+search (host отбрасывается — open redirect
// невозможен); proxy кладёт сюда абсолютный URL, относительные тоже принимаются.
function safeCallbackUrl(raw: unknown): string {
  const v = String(raw ?? "");
  if (!v) return "/projects";
  try {
    const u = new URL(v, "http://internal");
    // Корень — статически пререндеренная заглушка redirect("/projects"); её
    // закэшированный ответ несёт Location, который Next копирует в ответ
    // server action (не фильтруется в actionsForbiddenHeaders) — браузерный
    // fetch уходит по нему и клиент падает в global-error («This page couldn’t
    // load»). Поэтому на корень не редиректим — сразу в /projects.
    if (u.pathname === "/") return "/projects";
    const path = u.pathname + u.search;
    if (path.startsWith("/") && !path.startsWith("//")) return path;
  } catch {}
  return "/projects";
}

export async function authenticate(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")),
    });
    return undefined;
  } catch (e) {
    // ревью 2.1: различаем неверные креды и инфраструктурные сбои (упавшая БД
    // заворачивается в CallbackRouteError — тоже подкласс AuthError)
    if (e instanceof AuthError) {
      if (e.type === "CredentialsSignin") return "Неверный email или пароль";
      return "Сервис временно недоступен, попробуйте позже";
    }
    throw e; // redirect после успешного входа летит как throw — пробрасываем
  }
}
