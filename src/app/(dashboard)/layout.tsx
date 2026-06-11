import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { db } from "@/lib/db";
import { can, type Role } from "@/lib/rbac";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const STALE_AFTER_MIN = 12 * 60; // warning при свежести > 12 ч (решение ревью плана)

async function getFreshness(): Promise<{ label: string; stale: boolean }> {
  try {
    const { rows } = await db.query(
      "SELECT updated_at FROM nexus_admin.sync_meta WHERE key = 'last_sync_at'"
    );
    if (!rows[0]) return { label: "—", stale: false };
    const mins = Math.round((Date.now() - new Date(rows[0].updated_at).getTime()) / 60_000);
    const label =
      mins < 1 ? "только что" : mins < 60 ? `${mins} мин назад` : `${Math.round(mins / 60)} ч назад`;
    return { label, stale: mins > STALE_AFTER_MIN };
  } catch {
    return { label: "—", stale: false }; // свежесть не должна ронять кабинет
  }
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login"); // дублирует proxy — защита в глубину

  const role = session.user.role as Role;
  // имя/почта из БД, не из JWT: после переименования в профиле шапка обновляется
  // сразу, а не через 10-минутную ревалидацию токена (эпоха 7)
  const [{ rows: userRows }, freshness] = await Promise.all([
    db
      .query("SELECT name, email FROM nexus_admin.users WHERE id = $1", [session.user.id])
      .catch(() => ({ rows: [] })), // фолбэк на JWT ниже — сбой не роняет кабинет
    getFreshness(),
  ]);
  const user = {
    name: userRows[0]?.name ?? session.user.name ?? session.user.email ?? "—",
    email: userRows[0]?.email ?? session.user.email ?? "—",
    role,
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar showUsers={can.manageUsers(role)} />
        <SidebarInset>
          <AppHeader user={user} freshness={freshness} />
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
