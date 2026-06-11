"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";

import { logout } from "@/app/(dashboard)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const titles: Record<string, string> = {
  "/projects": "Проекты",
  "/employees": "Сотрудники",
  "/knowledge": "База знаний",
  "/sales": "Отдел продаж",
  "/users": "Пользователи",
  "/styleguide": "Styleguide",
};

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  employee: "Employee",
  client: "Client",
};

export function AppHeader({
  user,
  freshness,
}: {
  user: { name: string; role: string };
  freshness: { label: string; stale: boolean };
}) {
  const pathname = usePathname();
  const section = Object.keys(titles).find((p) => pathname.startsWith(p));
  const initial = (user.name[0] ?? "?").toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="!h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{section ? titles[section] : "Кабинет"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-4">
        {/* Свежесть данных из sync_meta (NEXADM-15); warning при > 12 ч */}
        <span
          className={`hidden items-center gap-1.5 text-xs sm:flex ${
            freshness.stale ? "font-medium text-amber-600" : "text-muted-foreground"
          }`}
        >
          <RefreshCw className="size-3.5" />
          {freshness.stale ? `данные устарели (${freshness.label})` : `обновлено: ${freshness.label}`}
        </span>
        <Separator orientation="vertical" className="!h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted">
            <Avatar className="size-7">
              <AvatarFallback className="bg-accent text-xs font-medium text-accent-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left leading-tight md:grid">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">
                {roleLabels[user.role] ?? user.role}
              </span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout()}>
              <LogOut className="size-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
