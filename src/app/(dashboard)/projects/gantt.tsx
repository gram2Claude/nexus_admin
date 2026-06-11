"use client";

import { useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { fmtTokens, fmtUsd, pct, type ProjectVM } from "./projects-overview";

const DAY = 86_400_000;
const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function fmtD(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Гант портфеля (NEXADM-22/23): горизонталь — календарь, вертикаль — проекты.
 * Полоса = плановый период; градиентная заливка = % выполнения по часам;
 * насечки — границы эпох; hover на сегмент эпохи — тултип с планом и фактом;
 * вертикальная линия — «сегодня». Реализация на позиционированных div'ах
 * (проценты от временного диапазона) — отзывчиво без пересчёта на ресайз.
 */
export function GanttChart({
  projects,
  canSeeCosts,
  dimCompleted,
}: {
  projects: ProjectVM[];
  canSeeCosts: boolean;
  dimCompleted: boolean;
}) {
  // лениво: один раз на маунт (react-hooks/purity запрещает impure-вызовы в рендере)
  const [today] = useState(() => Date.now());

  const stamps = projects.flatMap((p) => [
    +new Date(p.startDate!),
    +new Date(p.endDate!),
  ]);
  if (!stamps.length) return null;
  const pad = 4 * DAY;
  const d0 = Math.min(...stamps) - pad;
  const d1 = Math.max(...stamps) + pad;
  const span = d1 - d0;
  const x = (t: number) => Math.max(0, Math.min(100, ((t - d0) / span) * 100));

  // деления: месяцы (подписи) + недели (сетка по понедельникам)
  const months: { at: number; label: string }[] = [];
  const mCur = new Date(d0);
  mCur.setDate(1);
  mCur.setHours(0, 0, 0, 0);
  while (+mCur <= d1) {
    // месяц, начавшийся до диапазона, подписываем у левого края (частичный месяц)
    months.push({ at: x(Math.max(+mCur, d0)), label: MONTHS[mCur.getMonth()] });
    mCur.setMonth(mCur.getMonth() + 1);
  }
  const weeks: number[] = [];
  const wCur = new Date(d0);
  wCur.setHours(0, 0, 0, 0);
  while (wCur.getDay() !== 1) wCur.setDate(wCur.getDate() + 1);
  while (+wCur <= d1) {
    weeks.push(x(+wCur));
    wCur.setDate(wCur.getDate() + 7);
  }
  const todayX = today >= d0 && today <= d1 ? x(today) : null;

  return (
    <div className="flex flex-col gap-1">
      {/* шкала */}
      <div className="flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-6 flex-1">
          {months.map((m) => (
            <span
              key={m.at}
              className="absolute top-0 text-xs text-muted-foreground"
              style={{ left: `${m.at}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* строки проектов */}
      <div className="relative">
        {/* недельная сетка + линия «сегодня» на всю высоту */}
        <div className="pointer-events-none absolute inset-0 left-44">
          <div className="relative h-full">
            {weeks.map((w) => (
              <div
                key={w}
                className="absolute inset-y-0 border-l border-border/60"
                style={{ left: `${w}%` }}
              />
            ))}
            {todayX !== null && (
              <div
                className="absolute inset-y-0 z-10 border-l-2 border-[var(--status-overdue)]"
                style={{ left: `${todayX}%` }}
                title="сегодня"
              />
            )}
          </div>
        </div>

        {projects.map((p) => {
          const percent = pct(p) ?? 0;
          const bL = x(+new Date(p.startDate!));
          const bR = x(+new Date(p.endDate!) + DAY); // конец дня включительно
          const dim = dimCompleted && p.status === "completed";
          return (
            <div key={p.id} className={`flex items-center ${dim ? "opacity-50" : ""}`}>
              <div className="w-44 shrink-0 pr-3">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="text-xs tabular-nums text-muted-foreground">{percent}%</div>
              </div>
              <div className="relative h-12 flex-1">
                {/* полоса планового периода */}
                <div
                  className="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md bg-muted"
                  style={{ left: `${bL}%`, width: `${Math.max(bR - bL, 0.5)}%` }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${percent}%`,
                      background: "var(--gantt-gradient)",
                      boxShadow: "var(--gantt-glow)",
                    }}
                  />
                </div>
                {/* сегменты эпох: насечка + hover-зона с тултипом */}
                {p.epochs.map((e) => {
                  if (!e.startDate || !e.endDate) return null;
                  const eL = x(+new Date(e.startDate));
                  const eR = x(+new Date(e.endDate) + DAY);
                  const ePct =
                    e.planH && e.planH > 0
                      ? Math.min(100, Math.round((100 * e.doneH) / e.planH))
                      : null;
                  return (
                    <Tooltip key={e.extId}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute top-1/2 h-5 -translate-y-1/2 cursor-help border-l border-background/80 hover:bg-foreground/10"
                          style={{ left: `${eL}%`, width: `${Math.max(eR - eL, 0.3)}%` }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="flex flex-col gap-1 py-0.5">
                          <span className="font-medium">{e.name}</span>
                          {e.description && (
                            <span className="text-xs opacity-80">{e.description}</span>
                          )}
                          <span className="text-xs tabular-nums">
                            план: {fmtD(e.startDate)}–{fmtD(e.endDate)} · {e.planH ?? "—"} ч
                            {ePct !== null && ` · ${ePct}%`}
                          </span>
                          {e.fact && (
                            <span className="text-xs tabular-nums">
                              факт: {e.fact.hours.toFixed(1)} ч · {fmtTokens(e.fact.tokens)} ток
                              {canSeeCosts && ` · ≈${fmtUsd(e.fact.costUsd)}`}
                            </span>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="pl-44 pt-1 text-xs text-muted-foreground">
        Заливка — выполнено по часам · насечки — границы эпох (наведи для деталей) ·{" "}
        <span className="text-[var(--status-overdue)]">красная линия</span> — сегодня
      </p>
    </div>
  );
}
