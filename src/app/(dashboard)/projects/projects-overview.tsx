"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { updateProjectDescription } from "./actions";
import { GanttChart } from "./gantt";

export type EpochVM = {
  extId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  planH: number | null;
  doneH: number;
  fact: { hours: number; tokens: number; costUsd: number } | null;
};

export type ProjectVM = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "completed";
  doneH: number;
  globalH: number | null;
  startDate: string | null;
  endDate: string | null;
  fact: { hours: number; tokens: number; costUsd: number } | null;
  epochs: EpochVM[];
};

export function pct(p: ProjectVM): number | null {
  if (!p.globalH) return null;
  return Math.min(100, Math.round((100 * p.doneH) / p.globalH));
}

export function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

export function fmtUsd(n: number): string {
  return `$${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
}

type Filter = "active" | "completed" | "all";

export function ProjectsOverview({
  projects,
  canEdit,
  canSeeCosts,
}: {
  projects: ProjectVM[];
  canEdit: boolean;
  canSeeCosts: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<ProjectVM | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const visible = projects.filter((p) =>
    filter === "all" ? true : p.status === (filter === "active" ? "active" : "completed")
  );
  // на Ганте в режиме «все» завершённые приглушаются; в «завершённые» — показываются как есть
  const ganttProjects = visible.filter((p) => p.startDate && p.endDate);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Проекты</h1>
          <p className="text-sm text-muted-foreground">
            План-факт портфеля: {projects.length} проектов в реестре
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="active">Активные</TabsTrigger>
            <TabsTrigger value="completed">Завершённые</TabsTrigger>
            <TabsTrigger value="all">Все</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {visible.map((p) => {
          const percent = pct(p);
          return (
            <Card key={p.id} className="gap-3 py-4">
              <CardHeader className="px-4">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="-mr-1 -mt-1 shrink-0"
                      onClick={() => {
                        setEditing(p);
                        setText(p.description ?? "");
                        setError(undefined);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </div>
                <Badge variant="outline" className="w-fit gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      p.status === "completed"
                        ? "bg-[var(--status-done)]"
                        : "bg-[var(--status-wip)]"
                    }`}
                  />
                  {p.status === "completed" ? "завершён" : "активен"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 px-4">
                <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {p.description ?? "Описания пока нет"}
                </p>
                {percent !== null && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          background: "var(--gantt-gradient)",
                          boxShadow: "var(--gantt-glow)",
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums">{percent}%</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.doneH}/{p.globalH} ч
                    </span>
                  </div>
                )}
                {canSeeCosts && p.fact && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    факт: {p.fact.hours.toFixed(1)} ч · {fmtTokens(p.fact.tokens)} ток ·{" "}
                    ≈{fmtUsd(p.fact.costUsd)}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
        {visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            Нет проектов в этом фильтре
          </p>
        )}
      </div>

      {ganttProjects.length > 0 && (
        <Card className="py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">
              Гант {filter === "active" ? "активных проектов" : "проектов"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <GanttChart projects={ganttProjects} canSeeCosts={canSeeCosts} dimCompleted={filter === "all"} />
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Описание: {editing?.name}</DialogTitle>
            <DialogDescription>
              Краткое описание проекта для обзора (правка не перетирается синком).
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full rounded-md border bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            disabled={pending || !editing}
            onClick={() =>
              startTransition(async () => {
                if (!editing) return;
                const r = await updateProjectDescription(editing.id, text);
                setError(r.error);
                if (!r.error) setEditing(null);
              })
            }
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
