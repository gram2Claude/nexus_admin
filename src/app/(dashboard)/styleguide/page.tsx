import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { can } from "@/lib/rbac";

const swatches = [
  { name: "Фон приложения", cls: "bg-background border", hex: "#F8FAFC" },
  { name: "Поверхность (card)", cls: "bg-card border", hex: "#FFFFFF" },
  { name: "Подложки (muted)", cls: "bg-muted border", hex: "#F1F5F9" },
  { name: "Границы", cls: "bg-border", hex: "#E2E8F0" },
  { name: "Текст основной", cls: "bg-foreground", hex: "#0F172A" },
  { name: "Текст вторичный", cls: "bg-muted-foreground", hex: "#64748B" },
  { name: "Подсветка (accent)", cls: "bg-accent", hex: "#C7D2FE" },
  { name: "CTA / прогресс", cls: "bg-[var(--cta)]", hex: "#6366F1" },
];

const statuses = [
  { name: "Завершено", cls: "bg-[var(--status-done)]" },
  { name: "В работе", cls: "bg-[var(--status-wip)]" },
  { name: "В ожидании", cls: "bg-[var(--status-todo)]" },
  { name: "Просрочено", cls: "bg-[var(--status-overdue)]" },
];

function ThemePreview({
  label,
  note,
  swatches: themeSwatches,
}: {
  label: string;
  note: string;
  swatches: { hex: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 text-foreground">
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
        <div>
          <div className="text-lg font-semibold">Проект nexus_admin</div>
          <div className="text-sm text-muted-foreground">Эпоха 4 · обзор и Гант</div>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: "60%", background: "var(--gantt-fill)" }}
              />
            </div>
            <span className="text-sm font-medium tabular-nums">60%</span>
            <span className="text-xs text-muted-foreground">плоская</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: "60%",
                  background: "var(--gantt-gradient)",
                  boxShadow: "var(--gantt-glow)",
                }}
              />
            </div>
            <span className="text-sm font-medium tabular-nums">60%</span>
            <span className="text-xs text-muted-foreground">градиент + свечение</span>
          </div>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          106.75/176.5 ч · 18.2M ток · ≈$4 120
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <Badge key={s.name} variant="outline" className="gap-1.5">
              <span className={`size-2 rounded-full ${s.cls}`} />
              {s.name}
            </Badge>
          ))}
        </div>
        {/* прозрачные подсветки из рампы primary (наведи мышь на кнопки — hover полупрозрачный) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[20, 15, 10, 5].map((a) => (
            <span
              key={a}
              className="rounded-md px-2 py-1 text-xs font-medium"
              style={{ background: `color-mix(in srgb, var(--cta) ${a}%, transparent)` }}
            >
              подсветка {a}%
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="transition-colors hover:opacity-85">
            Открыть проект
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="transition-colors hover:bg-[color-mix(in_srgb,var(--cta)_15%,transparent)] hover:text-[var(--cta)]"
          >
            Прозрачный hover
          </Button>
          <Button size="sm" variant="outline">
            Контурная
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {themeSwatches.map((s) => (
          <div key={s.name} className="flex flex-col gap-1">
            <div className="h-8 rounded-md border" style={{ background: s.hex }} />
            <span className="text-[10px] leading-tight text-muted-foreground">
              {s.name}
              <br />
              {s.hex}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function StyleguidePage() {
  const session = await auth();
  if (!session?.user || !can.seeStyleguide(session.user.role)) redirect("/projects");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Styleguide</h1>
        <p className="text-muted-foreground">
          Дизайн-токены кабинета: палитра «Shadcn slate+indigo» + Geist
          (решение управленца, спека 1.1, ревизия 2026-06-10).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Палитра</CardTitle>
          <CardDescription>
            База ui.shadcn.com (тёмные кнопки, slate-нейтрали) + индиго: #C7D2FE —
            подсветки, #6366F1 — CTA и заливка Ганта.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {swatches.map((s) => (
            <div key={s.name} className="flex flex-col gap-1.5">
              <div className={`h-14 rounded-lg ${s.cls}`} />
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-xs text-muted-foreground">{s.hex}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Сравнение тем: светлая (текущая) vs Dark indigo</CardTitle>
          <CardDescription>
            Справа — тёмная тема по цветовой системе управленца (рампа индиго #6366F1,
            поверхности #020617/#0F172A, текст #F1F5F9/#94A3B8). Одинаковая карточка
            проекта в обеих темах.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <ThemePreview
            label="Светлая (согласована, действует)"
            note="Slate-нейтрали, тёмные кнопки, индиго — акцент."
            swatches={[
              { hex: "#F8FAFC", name: "фон" },
              { hex: "#FFFFFF", name: "поверхность" },
              { hex: "#0F172A", name: "текст/кнопки" },
              { hex: "#6366F1", name: "CTA/прогресс" },
            ]}
          />
          <div className="theme-dark-indigo contents">
            <ThemePreview
              label="Dark indigo (новый вариант)"
              note="Тёмные поверхности, индиго-кнопки, светлый текст."
              swatches={[
                { hex: "#020617", name: "фон" },
                { hex: "#0F172A", name: "поверхность" },
                { hex: "#F1F5F9", name: "текст" },
                { hex: "#6366F1", name: "primary/CTA" },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Типографика</CardTitle>
          <CardDescription>Geist, полная кириллица; цифры — tabular-nums</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <span className="text-2xl font-semibold">Заголовок страницы — 2xl semibold</span>
          <span className="text-lg font-medium">Заголовок блока — lg medium</span>
          <span>Обычный текст — base. Съешь же ещё этих мягких французских булок.</span>
          <span className="text-sm text-muted-foreground">
            Вторичный текст — sm muted
          </span>
          <span className="font-medium">
            Цифры: 1 234 567,89 ч · $12 045,07 · 98,5 %
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Кнопки, статусы и прогресс</CardTitle>
          <CardDescription>shadcn-варианты + семантика план-факта</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Основная</Button>
            <Button
              className="border-0 text-white"
              style={{ background: "var(--cta)" }}
            >
              CTA-акцент
            </Button>
            <Button variant="secondary">Вторичная</Button>
            <Button variant="outline">Контурная</Button>
            <Button variant="ghost">Прозрачная</Button>
            <Button variant="destructive">Удаление</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {statuses.map((s) => (
              <Badge key={s.name} variant="outline" className="gap-1.5">
                <span className={`size-2 rounded-full ${s.cls}`} />
                {s.name}
              </Badge>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: "62%", background: "var(--gantt-fill)" }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Образец полосы Ганта: заливка — выполнено (62 %), фон — осталось
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
