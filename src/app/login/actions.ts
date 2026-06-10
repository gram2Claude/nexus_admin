"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export async function authenticate(
  _prev: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/projects",
    });
    return undefined;
  } catch (e) {
    if (e instanceof AuthError) return "Неверный email или пароль";
    throw e; // redirect после успешного входа тоже летит как throw — пробрасываем
  }
}
