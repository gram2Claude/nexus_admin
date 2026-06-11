"use client";

import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { fmtTime, fmtTokens, fmtUsd, pct, type ProjectVM } from "./projects-overview";

const DAY = 86_400_000;
const MONTHS = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

// Вся датная арифметика — в UTC (ревью эпохи 4: смешение UTC-парсинга 'YYYY-MM-DD'
// с локальными setDate/getMonth давало сдвиги сетки и hydration mismatch между TZ).
const utc = (iso: string) => +new Date(`${iso}T00:00:00Z`);

// даты приходят как date::text 'YYYY-MM-DD' — форматируем слайсом, без Date/TZ
const fmtD = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");

/**
 * Гант портфеля (NEXADM-22/23): горизонталь — календарь, вертикаль — проекты.
 * Полоса = плановый период; градиентная заливка = % выполнения по часам;
 * насечки — границы эпох; hover на сегмент эпохи — тултип с планом (и фактом
 * для seeCosts); вертикальная линия — «сегодня» (приходит с сервера — без
 * hydration mismatch). Позиционированные div'ы с % от временного диапазона.
 */
/** Уровни детализации (фидбек управленца): 1 — детальный (насечки эпох + недели),
 *  2 — по неделям (без насечек), 3 — по месяцам (только месячная сетка). */
export type GanttLevel = 1 | 2 | 3;

export function GanttChart({
  projects,
  canSeeCosts,
  dimCompleted,
  todayIso,
  level,
}: {
  projects: ProjectVM[];
  canSeeCosts: boolean;
  dimCompleted: boolean;
  todayIso: string;
  level: GanttLevel;
}) {
  const stamps = projects.flatMap((p) => [utc(p.startDate!), utc(p.endDate!)]);
  if (!stamps.length) return null;
  const min = Math.min(...stamps);
  const max = Math.max(...stamps);

  // Домен оси зависит от уровня (фидбек управленца: «гистограмма должна уменьшаться
  // при укрупнении»): чем крупнее группировка, тем шире календарный диапазон → полосы короче.
  let d0: number;
  let d1: number;
  if (level === 1) {
    d0 = min - 4 * DAY;
    d1 = max + 4 * DAY;
  } else if (level === 2) {
    // снап к понедельникам ± 2 недели
    const s = new Date(min);
    s.setUTCHours(0, 0, 0, 0);
    while (s.getUTCDay() !== 1) s.setUTCDate(s.getUTCDate() - 1);
    d0 = +s - 14 * DAY;
    const e = new Date(max);
    e.setUTCHours(0, 0, 0, 0);
    while (e.getUTCDay() !== 1) e.setUTCDate(e.getUTCDate() + 1);
    d1 = +e + 14 * DAY;
  } else {
    // снап к первым числам месяцев ± 1 месяц
    const s = new Date(min);
    s.setUTCDate(1);
    s.setUTCHours(0, 0, 0, 0);
    s.setUTCMonth(s.getUTCMonth() - 1);
    d0 = +s;
    const e = new Date(max);
    e.setUTCDate(1);
    e.setUTCHours(0, 0, 0, 0);
    e.setUTCMonth(e.getUTCMonth() + 2);
    d1 = +e;
  }
  const span = d1 - d0;
  const x = (t: number) => Math.max(0, Math.min(100, ((t - d0) / span) * 100));

  // деления: месяцы (подписи) + недели (сетка по понедельникам), всё в UTC
  const months: { ts: number; at: number; label: string }[] = [];
  const mCur = new Date(d0);
  mCur.setUTCDate(1);
  mCur.setUTCHours(0, 0, 0, 0);
  while (+mCur <= d1) {
    // месяц, начавшийся до диапазона, подписываем у левого края (частичный месяц)
    months.push({ ts: +mCur, at: x(Math.max(+mCur, d0)), label: MONTHS[mCur.getUTCMonth()] });
    mCur.setUTCMonth(mCur.getUTCMonth() + 1);
  }
  // подпись частичного месяца убираем, если до следующей подписи < 4% (наложение)
  const monthLabels = months.filter(
    (m, i) => i === months.length - 1 || months[i + 1].at - m.at >= 4
  );
  const weeks: { ts: number; at: number }[] = [];
  const wCur = new Date(d0);
  wCur.setUTCHours(0, 0, 0, 0);
  while (wCur.getUTCDay() !== 1) wCur.setUTCDate(wCur.getUTCDate() + 1);
  while (+wCur <= d1) {
    weeks.push({ ts: +wCur, at: x(+wCur) });
    wCur.setUTCDate(wCur.getUTCDate() + 7);
  }
  // подписи дат у недельных отсечек (фидбек управленца); при плотной сетке — через одну
  const weekLabelStep = weeks.length > 14 ? 2 : 1;
  const fmtTs = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };

  const today = utc(todayIso);
  const todayX = today >= d0 && today <= d1 ? x(today) : null;

  return (
    <div className="flex flex-col gap-1">
      {/* шкала сверху: только месяцы; даты недель — на нижней оси (фидбек управленца) */}
      <div className="flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-5 flex-1">
          {monthLabels.map((m) => (
            <span
              key={m.ts}
              className="absolute top-0 text-xs font-medium text-muted-foreground"
              style={{ left: `${m.at}%` }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* строки проектов */}
      <div className="relative">
        {/* сетка (недели или месяцы — по уровню) + линия «сегодня» на всю высоту */}
        <div className="pointer-events-none absolute inset-0 left-44">
          <div className="relative h-full">
            {/* пунктир — линия явно ведёт к своей дате на нижней оси (фидбек управленца) */}
            {(level === 3 ? months : weeks).map((w) => (
              <div
                key={w.ts}
                className="absolute inset-y-0 border-l border-dashed border-border"
                style={{ left: `${w.at}%` }}
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
          const bL = x(utc(p.startDate!));
          const bR = x(utc(p.endDate!) + DAY); // конец дня включительно
          const dim = dimCompleted && p.status === "completed";
          return (
            <div key={p.id} className={`flex items-center ${dim ? "opacity-50" : ""}`}>
              {/* название в 2 строки: до « — » и после; клик — drill-down проекта
                  (фидбек управленца) */}
              <Link
                href={`/projects/${p.slug}`}
                className="group w-44 shrink-0 pr-3"
              >
                <div className="truncate text-sm font-medium group-hover:underline">
                  {p.name.split(" — ")[0]}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.name.includes(" — ")
                    ? p.name.slice(p.name.indexOf(" — ") + 3)
                    : (p.description ?? "")}
                </div>
              </Link>
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
                {/* % выполнения — справа от полосы (фидбек управленца) */}
                <span
                  className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-xs font-medium tabular-nums"
                  style={{ left: `${Math.min(bR, 93)}%` }}
                >
                  {percent}%
                </span>
                {/* сегменты эпох: насечка + hover-зона с тултипом — только детальный уровень */}
                {level === 1 && p.epochs.map((e) => {
                  if (!e.startDate || !e.endDate) return null;
                  const eL = x(utc(e.startDate));
                  const eR = x(utc(e.endDate) + DAY);
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
                          {/* вся факт-строка под seeCosts: часы/токены — тоже затраты
                              по матрице прав (ревью эпохи 4, P1) */}
                          {canSeeCosts && e.fact && (
                            <span className="text-xs tabular-nums">
                              факт: {fmtTime(e.fact.hours)} · {fmtTokens(e.fact.tokens)} ток
                              {` · ≈${fmtUsd(e.fact.costUsd)}`}
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

      {/* нижняя ось: даты недель (уровни 1–2) или месяцы (уровень 3) под пунктирами */}
      <div className="flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-5 flex-1 border-t border-border">
          {level === 3
            ? monthLabels.map((m) => (
                <span
                  key={m.ts}
                  className="absolute top-0.5 -translate-x-1/2 text-[10px] text-muted-foreground"
                  style={{ left: `${m.at}%` }}
                >
                  {m.label}
                </span>
              ))
            : weeks
                .filter((_, i) => i % weekLabelStep === 0)
                .map((w) => (
                  <span
                    key={w.ts}
                    className="absolute top-0.5 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                    style={{ left: `${w.at}%` }}
                  >
                    {fmtTs(w.ts)}
                  </span>
                ))}
        </div>
      </div>

      <p className="pl-44 pt-1 text-xs text-muted-foreground">
        Заливка — выполнено по часам ·{" "}
        {level === 1 && <>насечки — границы эпох (наведи для деталей) · </>}
        <span className="text-[var(--status-overdue)]">красная линия</span> — сегодня
      </p>
    </div>
  );
}
