"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { updateProjectDescription } from "./actions";

export type ProjectRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "completed";
  done_h: string | null;
  global_h: string | null;
};

function pct(p: ProjectRow): number | null {
  const done = Number(p.done_h);
  const total = Number(p.global_h);
  if (!total || Number.isNaN(done)) return null;
  return Math.min(100, Math.round((100 * done) / total));
}

export function ProjectsDraftList({
  projects,
  canEdit,
}: {
  projects: ProjectRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Проекты</h1>
        <p className="text-sm text-muted-foreground">
          Черновой список — обзор с Гантом и drill-down появятся в эпохах 4–5 (NEXADM-20…29)
        </p>
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {projects.map((p) => {
            const percent = pct(p);
            return (
              <div key={p.id} className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <Badge variant="outline" className="gap-1.5">
                      <span
                        className={`size-2 rounded-full ${
                          p.status === "completed"
                            ? "bg-[var(--status-done)]"
                            : "bg-[var(--status-wip)]"
                        }`}
                      />
                      {p.status === "completed" ? "завершён" : "активен"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.description ?? "Описания пока нет — добавь через ✏"}
                  </p>
                </div>
                {percent !== null && (
                  <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
                    {/* фиксированная длина полосы + % справа — выравнивание в столбец (фидбек управленца) */}
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${percent}%`, background: "var(--gantt-fill)" }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm font-medium tabular-nums">
                        {percent}%
                      </span>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.done_h}/{p.global_h} ч
                    </span>
                  </div>
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
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
            );
          })}
        </CardContent>
      </Card>

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
