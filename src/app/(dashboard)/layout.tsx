import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { can, type Role } from "@/lib/rbac";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  if (!session?.user) redirect("/login"); // дублирует proxy — защита в глубину

  const role = session.user.role as Role;
  const user = {
    name: session.user.name ?? session.user.email ?? "—",
    role,
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar showUsers={can.manageUsers(role)} />
        <SidebarInset>
          <AppHeader user={user} />
          <main className="flex-1 p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
