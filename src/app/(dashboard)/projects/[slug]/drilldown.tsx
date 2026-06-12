"use client";

import { ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ModelFact } from "@/server/fact";

import { fmtTime, fmtTokens, fmtUsd } from "../projects-overview";
import { addMember, getTaskModels, removeMember } from "./actions";

type Fact = { hours: number; tokens: number; costUsd: number } | null;
type Status = "done" | "wip" | "todo";

export type TaskVM = {
  readableId: string | null;
  name: string;
  taskType: string;
  status: string;
  planH: number | null;
  executor: string | null;
  fact: Fact;
};

/** Узел «Прочие работы» спринта (спека 11): план — бюджет канонной misc-задачи
 *  (misc_rate, IT2), наполнение — внеплановые задачи реестра timechecker. */
export type MiscVM = {
  planH: number | null;
  fact: Fact;
  tasks: TaskVM[];
};

export type SprintVM = {
  extId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  planH: number | null;
  doneH: number;
  status: Status;
  fact: Fact;
  misc: MiscVM | null;
  tasks: TaskVM[];
};

export type EpochVM2 = {
  extId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  planH: number | null;
  doneH: number;
  status: Status;
  fact: Fact;
  sprints: SprintVM[];
};

export type DrilldownVM = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "completed";
  doneH: number;
  globalH: number | null;
  fact: Fact;
  epochs: EpochVM2[];
  /** прочие работы с архивным/неизвестным спринтом — группа «вне спринтов» */
  miscOrphans: TaskVM[];
};

const fmtD = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    done: { label: "завершено", cls: "bg-[var(--status-done)]" },
    wip: { label: "в работе", cls: "bg-[var(--status-wip)]" },
    in_progress: { label: "в работе", cls: "bg-[var(--status-wip)]" },
    todo: { label: "в ожидании", cls: "bg-[var(--status-todo)]" },
  };
  const s = map[status] ?? map.todo;
  return (
    <Badge variant="outline" className="gap-1.5 whitespace-nowrap">
      <span className={`size-2 rounded-full ${s.cls}`} />
      {s.label}
    </Badge>
  );
}

function FactLine({ fact, planH }: { fact: Fact; planH?: number | null }) {
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {planH != null && <>план {fmtTime(planH)}</>}
      {fact && (
        <>
          {planH != null && " · "}факт {fmtTime(fact.hours)} · {fmtTokens(fact.tokens)} ток ·{" "}
          ≈{fmtUsd(fact.costUsd)}
        </>
      )}
    </span>
  );
}

function levelPct(doneH: number, planH: number | null): number | null {
  if (!planH) return null;
  return Math.min(100, Math.round((100 * doneH) / planH));
}

/** Таблица задач — общая для плановых задач спринта и «Прочих работ». */
function TasksTable({
  tasks,
  canSeeCosts,
  onOpen,
}: {
  tasks: TaskVM[];
  canSeeCosts: boolean;
  onOpen: (t: TaskVM) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Задача</TableHead>
          <TableHead>Тип</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">План</TableHead>
          {canSeeCosts && (
            <>
              <TableHead className="text-right">Факт</TableHead>
              <TableHead className="text-right">Ток</TableHead>
              <TableHead className="text-right">≈$</TableHead>
            </>
          )}
          <TableHead>Исполнитель</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((t) => (
          <TableRow
            key={t.readableId ?? t.name}
            className={canSeeCosts && t.readableId ? "cursor-pointer" : undefined}
            onClick={canSeeCosts && t.readableId ? () => onOpen(t) : undefined}
          >
            <TableCell className="whitespace-nowrap text-xs tabular-nums">
              {t.readableId ?? "—"}
            </TableCell>
            <TableCell className="max-w-72 truncate text-sm">{t.name}</TableCell>
            <TableCell className="text-xs">{t.taskType}</TableCell>
            <TableCell>
              <StatusBadge status={t.status} />
            </TableCell>
            <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
              {t.planH != null ? fmtTime(t.planH) : "—"}
            </TableCell>
            {canSeeCosts && (
              <>
                <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                  {t.fact ? fmtTime(t.fact.hours) : "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {t.fact ? fmtTokens(t.fact.tokens) : "—"}
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums">
                  {t.fact ? `≈${fmtUsd(t.fact.costUsd)}` : "—"}
                </TableCell>
              </>
            )}
            <TableCell className="text-xs">{t.executor ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Узел «Прочие работы» спринта: бюджет misc-задачи канона + внеплановые задачи. */
function MiscBlock({
  misc,
  canSeeCosts,
  onOpen,
}: {
  misc: MiscVM;
  canSeeCosts: boolean;
  onOpen: (t: TaskVM) => void;
}) {
  return (
    <div className="mt-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Прочие работы</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {misc.tasks.length}{" "}
          {misc.tasks.length % 10 === 1 && misc.tasks.length % 100 !== 11
            ? "задача"
            : [2, 3, 4].includes(misc.tasks.length % 10) &&
                ![12, 13, 14].includes(misc.tasks.length % 100)
              ? "задачи"
              : "задач"}
          {misc.planH != null && <> · бюджет {fmtTime(misc.planH)}</>}
          {canSeeCosts && misc.fact && (
            <>
              {" "}· факт {fmtTime(misc.fact.hours)} · {fmtTokens(misc.fact.tokens)} ток ·{" "}
              ≈{fmtUsd(misc.fact.costUsd)}
            </>
          )}
        </span>
      </div>
      {misc.tasks.length > 0 && (
        <TasksTable tasks={misc.tasks} canSeeCosts={canSeeCosts} onOpen={onOpen} />
      )}
    </div>
  );
}

export function Drilldown({
  project,
  canSeeCosts,
  canManageMembers,
  members,
  allUsers,
}: {
  project: DrilldownVM;
  canSeeCosts: boolean;
  canManageMembers: boolean;
  members: { id: string; label: string }[];
  allUsers: { id: string; label: string }[];
}) {
  const [sheetTask, setSheetTask] = useState<TaskVM | null>(null);
  const [models, setModels] = useState<ModelFact[] | null>(null);
  const [modelsError, setModelsError] = useState<string | undefined>();
  const [memberToAdd, setMemberToAdd] = useState<string>("");
  const [memberError, setMemberError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  // защита от гонки: медленный ответ по задаче A не должен затирать открытую B (ревью эпохи 5)
  const currentTaskRef = useRef<string | null>(null);

  const pct = project.globalH
    ? Math.min(100, Math.round((100 * project.doneH) / project.globalH))
    : null;
  const candidates = allUsers.filter((u) => !members.some((m) => m.id === u.id));

  const openTask = (t: TaskVM) => {
    if (!canSeeCosts || !t.readableId) return;
    setSheetTask(t);
    setModels(null);
    setModelsError(undefined);
    currentTaskRef.current = t.readableId;
    startTransition(async () => {
      const r = await getTaskModels(t.readableId!, project.slug);
      if (currentTaskRef.current !== t.readableId) return; // устаревший ответ — игнор
      setModelsError(r.error);
      setModels(r.models ?? []);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href="/projects">
            <ArrowLeft className="size-4" />
            Проекты
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <StatusBadge status={project.status === "completed" ? "done" : "wip"} />
        </div>
        {project.description && (
          <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {pct !== null && (
            <>
              <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: "var(--gantt-gradient)",
                    boxShadow: "var(--gantt-glow)",
                  }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums">{pct}%</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {project.doneH}/{project.globalH} ч
              </span>
            </>
          )}
          {canSeeCosts && project.fact && (
            <span className="text-xs tabular-nums text-muted-foreground">
              факт: {fmtTime(project.fact.hours)} · {fmtTokens(project.fact.tokens)} ток ·{" "}
              ≈{fmtUsd(project.fact.costUsd)}
            </span>
          )}
        </div>
      </div>

      {canManageMembers && (
        <Card className="py-3">
          <CardContent className="flex flex-wrap items-center gap-2 px-4">
            <span className="text-sm font-medium">Участники:</span>
            {members.length === 0 && (
              <span className="text-sm text-muted-foreground">никто не назначен</span>
            )}
            {members.map((m) => (
              <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
                {m.label}
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-5 p-0"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await removeMember(project.id, m.id, project.slug);
                      setMemberError(r.error);
                    })
                  }
                >
                  <UserMinus className="size-3" />
                </Button>
              </Badge>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue placeholder="Добавить участника…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !memberToAdd}
                onClick={() =>
                  startTransition(async () => {
                    const r = await addMember(project.id, memberToAdd, project.slug);
                    setMemberError(r.error);
                    if (!r.error) setMemberToAdd("");
                  })
                }
              >
                <UserPlus className="size-4" />
              </Button>
            </div>
            {memberError && <p className="w-full text-sm text-destructive">{memberError}</p>}
          </CardContent>
        </Card>
      )}

      <Accordion
        type="multiple"
        defaultValue={project.epochs.filter((e) => e.status === "wip").map((e) => e.extId)}
        className="flex flex-col gap-2"
      >
        {project.epochs.map((e) => (
          <AccordionItem
            key={e.extId}
            value={e.extId}
            className="rounded-xl border bg-card px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-2">
                <div className="flex flex-col items-start gap-0.5 text-left">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmtD(e.startDate)}–{fmtD(e.endDate)} ·{" "}
                    <FactLine fact={e.fact} planH={e.planH} />
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={e.status} />
                  <span className="w-10 text-right text-sm font-medium tabular-nums">
                    {levelPct(e.doneH, e.planH) !== null
                      ? `${levelPct(e.doneH, e.planH)}%`
                      : "—"}
                  </span>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {e.description && (
                <p className="pb-2 text-sm text-muted-foreground">{e.description}</p>
              )}
              <Accordion
                type="multiple"
                defaultValue={e.sprints.filter((s) => s.status === "wip").map((s) => s.extId)}
                className="flex flex-col gap-2"
              >
                {e.sprints.map((s) => (
                  <AccordionItem
                    key={s.extId}
                    value={s.extId}
                    className="rounded-lg border bg-background/50 px-3"
                  >
                    <AccordionTrigger className="py-3 hover:no-underline">
                      <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-2">
                        <div className="flex flex-col items-start gap-0.5 text-left">
                          <span className="text-sm font-medium">{s.name}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {fmtD(s.startDate)}–{fmtD(s.endDate)} ·{" "}
                            <FactLine fact={s.fact} planH={s.planH} />
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={s.status} />
                          <span className="w-10 text-right text-sm font-medium tabular-nums">
                            {levelPct(s.doneH, s.planH) !== null
                              ? `${levelPct(s.doneH, s.planH)}%`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <TasksTable
                        tasks={s.tasks}
                        canSeeCosts={canSeeCosts}
                        onOpen={openTask}
                      />
                      {s.misc && (
                        <MiscBlock
                          misc={s.misc}
                          canSeeCosts={canSeeCosts}
                          onOpen={openTask}
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {project.miscOrphans.length > 0 && (
        <Card className="py-3">
          <CardContent className="flex flex-col gap-2 px-4">
            <span className="text-sm font-medium">
              Прочие работы (вне спринтов)
            </span>
            <TasksTable
              tasks={project.miscOrphans}
              canSeeCosts={canSeeCosts}
              onOpen={openTask}
            />
          </CardContent>
        </Card>
      )}

      <Sheet open={!!sheetTask} onOpenChange={(o) => !o && setSheetTask(null)}>
        {/* ширину перебивать только с тем же data-side-вариантом: базовый
            data-[side=right]:sm:max-w-sm специфичнее голого sm:max-w-* и иначе побеждает */}
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            {/* pr-8: кнопка закрытия (size-7 + right-3 = 40px) absolute — длинный
                заголовок иначе уходит под крестик (скрин 00_10) */}
            <SheetTitle className="pr-8 text-base">
              {sheetTask?.readableId} · {sheetTask?.name}
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {sheetTask && <StatusBadge status={sheetTask.status} />}
              {sheetTask?.planH != null && <>план {fmtTime(sheetTask.planH)}</>}
              {sheetTask?.executor && <>· исполнитель {sheetTask.executor}</>}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {modelsError ? (
              <p className="text-sm text-destructive">{modelsError}</p>
            ) : models === null ? (
              <p className="text-sm text-muted-foreground">Загружаем модели…</p>
            ) : models.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                По задаче пока нет данных об использовании моделей.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Модель</TableHead>
                    <TableHead className="text-right">Время</TableHead>
                    <TableHead className="text-right">Токены</TableHead>
                    <TableHead className="text-right">Кэш</TableHead>
                    <TableHead className="text-right">≈$</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((m) => (
                    <TableRow key={m.model}>
                      <TableCell className="text-xs">{m.model}</TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                        {fmtTime(m.minutes / 60)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {fmtTokens(m.tokens)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {fmtTokens(m.cache_read + m.cache_creation)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        ≈{fmtUsd(m.cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium">
                    <TableCell className="text-xs">итого</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                      {fmtTime(models.reduce((a, m) => a + m.minutes, 0) / 60)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtTokens(models.reduce((a, m) => a + m.tokens, 0))}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {fmtTokens(
                        models.reduce((a, m) => a + m.cache_read + m.cache_creation, 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      ≈{fmtUsd(models.reduce((a, m) => a + m.cost_usd, 0))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
