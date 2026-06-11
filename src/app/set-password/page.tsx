import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { peekInvite } from "@/lib/invites";

import { SetPasswordForm } from "./set-password-form";

// токен в query: referrer наружу не отдаём (ревью 2.2)
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await peekInvite(token) : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <LayoutDashboard className="size-6" />
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">Nexus Admin</div>
          <div className="text-sm text-muted-foreground">кабинет управленца</div>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Установка пароля</CardTitle>
          {invite && <CardDescription>{invite.email}</CardDescription>}
        </CardHeader>
        <CardContent>
          {invite && token ? (
            <SetPasswordForm token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ссылка недействительна, запросите новое приглашение у Owner/Admin.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
