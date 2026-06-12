"use client";

import { LogOut, Moon, RefreshCw, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/(dashboard)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
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
  "/chats": "Чаты",
  "/servers": "Серверы",
  "/users": "Пользователи",
  "/profile": "Профиль",
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
  user: { name: string; email: string; role: string };
  freshness: { label: string; stale: boolean };
}) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const section = Object.keys(titles).find((p) => pathname.startsWith(p));
  const initial = (user.name[0] ?? "?").toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="!h-5" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {/* глубже корня раздела название кликабельно и ведёт на корень
                (скрин 00_12: «Проекты» с drill-down → /projects) */}
            {section && pathname !== section ? (
              <BreadcrumbLink asChild>
                <Link href={section}>{titles[section]}</Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{section ? titles[section] : "Кабинет"}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {/* Свежесть данных из sync_meta (NEXADM-15); warning при > 12 ч.
          Переехала из правого угла к названию страницы (фидбек управленца) */}
      <Separator orientation="vertical" className="!h-5 hidden sm:block" />
      <span
        className={`hidden items-center gap-1.5 text-xs sm:flex ${
          freshness.stale ? "font-medium text-amber-600" : "text-muted-foreground"
        }`}
      >
        <RefreshCw className="size-3.5" />
        {freshness.stale ? `данные устарели (${freshness.label})` : `обновлено: ${freshness.label}`}
      </span>

      <div className="ml-auto flex items-center gap-4">
        {/* переключатель темы — на месте «обновлено» (фидбек управленца);
            иконки через dark:-классы, чтобы SSR-разметка не зависела от темы */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Переключить тему"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Moon className="size-4 dark:hidden" />
          <Sun className="hidden size-4 dark:block" />
        </Button>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="grid leading-tight">
              <span className="truncate">{user.name}</span>
              {/* почта под именем — фидбек управленца (00_04.jpg) */}
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile">
                <UserRound className="size-4" />
                Профиль
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault(); // меню не закрываем — удобно щёлкать туда-обратно
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
              }}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
              {resolvedTheme === "dark" ? "Светлая тема" : "Тёмная тема"}
            </DropdownMenuItem>
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
