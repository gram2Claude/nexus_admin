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
