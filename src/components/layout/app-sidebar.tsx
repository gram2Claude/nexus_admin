"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpen,
  FolderKanban,
  LayoutDashboard,
  MessagesSquare,
  Server,
  UserCog,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const sections = [
  { title: "Проекты", href: "/projects", icon: FolderKanban, stub: false },
  { title: "Сотрудники", href: "/employees", icon: Users, stub: true },
  { title: "База знаний", href: "/knowledge", icon: BookOpen, stub: true },
  { title: "Отдел продаж", href: "/sales", icon: Banknote, stub: true },
  { title: "Чаты", href: "/chats", icon: MessagesSquare, stub: true },
];

export function AppSidebar({
  showUsers,
  showServers,
}: {
  showUsers: boolean;
  showServers: boolean;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/projects">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <LayoutDashboard className="size-4" />
                </div>
                <div className="grid leading-tight">
                  <span className="font-semibold">Nexus Admin</span>
                  <span className="text-xs text-muted-foreground">
                    кабинет управленца
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Разделы</SidebarGroupLabel>
          <SidebarMenu>
            {sections.map((s) => (
              <SidebarMenuItem key={s.href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith(s.href)}
                  tooltip={s.title}
                >
                  <Link href={s.href}>
                    <s.icon />
                    <span>{s.title}</span>
                  </Link>
                </SidebarMenuButton>
                {s.stub && <SidebarMenuBadge>⏳</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
            {/* «Серверы» — только Owner/Admin (can.seeServers), как «Пользователи» */}
            {showServers && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/servers")}
                  tooltip="Серверы"
                >
                  <Link href="/servers">
                    <Server />
                    <span>Серверы</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {showUsers && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname.startsWith("/users")}
                tooltip="Пользователи"
              >
                <Link href="/users">
                  <UserCog />
                  <span>Пользователи</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
