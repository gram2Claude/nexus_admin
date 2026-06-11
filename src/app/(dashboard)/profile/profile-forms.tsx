"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { changePassword, updateName } from "./actions";

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  employee: "Employee",
  client: "Client",
};

export function ProfileForms({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string;
}) {
  const [nameValue, setNameValue] = useState(name);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwd, setPwd] = useState({ current: "", next1: "", next2: "" });
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Профиль</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Данные аккаунта</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-[5rem_1fr] items-center gap-2">
            <span className="text-sm text-muted-foreground">Email</span>
            <span className="text-sm">{email}</span>
            <span className="text-sm text-muted-foreground">Роль</span>
            <Badge variant="outline">{roleLabels[role] ?? role}</Badge>
          </div>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setNameMsg(null);
              startTransition(async () => {
                const r = await updateName(nameValue);
                setNameMsg(
                  r.error ? { ok: false, text: r.error } : { ok: true, text: "Имя сохранено" }
                );
              });
            }}
          >
            <Label htmlFor="profile-name">Имя</Label>
            <p className="text-xs text-muted-foreground">
              Отображается в шапке и в колонке «Исполнитель»
            </p>
            <div className="flex gap-2">
              <Input
                id="profile-name"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                maxLength={60}
                required
              />
              <Button type="submit" disabled={pending || nameValue.trim() === name}>
                Сохранить
              </Button>
            </div>
            {nameMsg && (
              <p className={`text-sm ${nameMsg.ok ? "text-[var(--status-done)]" : "text-destructive"}`}>
                {nameMsg.ok ? "✓ " : ""}{nameMsg.text}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Смена пароля</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setPwdMsg(null);
              startTransition(async () => {
                const r = await changePassword(pwd.current, pwd.next1, pwd.next2);
                if (r.error) {
                  setPwdMsg({ ok: false, text: r.error });
                } else {
                  setPwdMsg({ ok: true, text: "Пароль изменён" });
                  setPwd({ current: "", next1: "", next2: "" });
                }
              });
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="pwd-current">Текущий пароль</Label>
              <Input
                id="pwd-current"
                type="password"
                autoComplete="current-password"
                value={pwd.current}
                onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pwd-next1">Новый пароль (минимум 12 символов)</Label>
              <Input
                id="pwd-next1"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                value={pwd.next1}
                onChange={(e) => setPwd({ ...pwd, next1: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pwd-next2">Новый пароль ещё раз</Label>
              <Input
                id="pwd-next2"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                value={pwd.next2}
                onChange={(e) => setPwd({ ...pwd, next2: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={pending} className="self-start">
              {pending ? "Сохраняем…" : "Сменить пароль"}
            </Button>
            {pwdMsg && (
              <p className={`text-sm ${pwdMsg.ok ? "text-[var(--status-done)]" : "text-destructive"}`}>
                {pwdMsg.ok ? "✓ " : "✗ "}{pwdMsg.text}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
