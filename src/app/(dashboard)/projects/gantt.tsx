"use client";

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
export function GanttChart({
  projects,
  canSeeCosts,
  dimCompleted,
  todayIso,
}: {
  projects: ProjectVM[];
  canSeeCosts: boolean;
  dimCompleted: boolean;
  todayIso: string;
}) {
  const stamps = projects.flatMap((p) => [utc(p.startDate!), utc(p.endDate!)]);
  if (!stamps.length) return null;
  const pad = 4 * DAY;
  const d0 = Math.min(...stamps) - pad;
  const d1 = Math.max(...stamps) + pad;
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
        {/* недельная сетка + линия «сегодня» на всю высоту */}
        <div className="pointer-events-none absolute inset-0 left-44">
          <div className="relative h-full">
            {/* пунктир — линия явно ведёт к своей дате на нижней оси (фидбек управленца) */}
            {weeks.map((w) => (
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
              {/* название в 2 строки: часть до « — » и часть после (фидбек управленца) */}
              <div className="w-44 shrink-0 pr-3">
                <div className="truncate text-sm font-medium">
                  {p.name.split(" — ")[0]}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.name.includes(" — ")
                    ? p.name.slice(p.name.indexOf(" — ") + 3)
                    : (p.description ?? "")}
                </div>
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
                {/* % выполнения — справа от полосы (фидбек управленца) */}
                <span
                  className="absolute top-1/2 -translate-y-1/2 pl-1.5 text-xs font-medium tabular-nums"
                  style={{ left: `${Math.min(bR, 93)}%` }}
                >
                  {percent}%
                </span>
                {/* сегменты эпох: насечка + hover-зона с тултипом */}
                {p.epochs.map((e) => {
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
                              факт: {e.fact.hours.toFixed(1)} ч · {fmtTokens(e.fact.tokens)} ток
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

      {/* нижняя ось: даты начала недель под своими пунктирами */}
      <div className="flex">
        <div className="w-44 shrink-0" />
        <div className="relative h-5 flex-1 border-t border-border">
          {weeks
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
        Заливка — выполнено по часам · насечки — границы эпох (наведи для деталей) ·{" "}
        <span className="text-[var(--status-overdue)]">красная линия</span> — сегодня
      </p>
    </div>
  );
}
