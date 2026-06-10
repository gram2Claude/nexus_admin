import { LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/projects");

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
          <CardTitle>Вход</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Вход только по приглашению Owner/Admin
      </p>
    </main>
  );
}
