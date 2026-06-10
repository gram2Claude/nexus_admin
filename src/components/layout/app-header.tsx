"use client";

import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
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

export function AppHeader() {
  const pathname = usePathname();
  const section = Object.keys(titles).find((p) => pathname.startsWith(p));

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
        {/* Метка свежести данных — реальное значение подключит синк (NEXADM-15) */}
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <RefreshCw className="size-3.5" />
          обновлено: —
        </span>
        <Separator orientation="vertical" className="!h-5" />
        {/* Заглушка пользователя — реальная сессия и роль придут с auth (эпоха 2) */}
        <div className="flex items-center gap-2">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              О
            </AvatarFallback>
          </Avatar>
          <div className="hidden leading-tight md:grid">
            <span className="text-sm font-medium">Олег</span>
            <span className="text-xs text-muted-foreground">Owner</span>
          </div>
        </div>
      </div>
    </header>
  );
}
