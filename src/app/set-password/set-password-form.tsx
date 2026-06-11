"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { setPassword } from "./actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [error, formAction, pending] = useActionState(setPassword, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Пароль
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password2" className="text-sm font-medium">
          Повторите пароль
        </label>
        <Input
          id="password2"
          name="password2"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Сохраняем…" : "Сохранить и войти"}
      </Button>
    </form>
  );
}
