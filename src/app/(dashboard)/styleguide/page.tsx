import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const swatches = [
  { name: "Фон приложения", cls: "bg-background border", hex: "#F6F7F9" },
  { name: "Поверхность (card)", cls: "bg-card border", hex: "#FFFFFF" },
  { name: "Текст основной", cls: "bg-foreground", hex: "#0F172A" },
  { name: "Текст вторичный", cls: "bg-muted-foreground", hex: "#64748B" },
  { name: "Акцент (primary)", cls: "bg-primary", hex: "#16A34A" },
  { name: "График: синий", cls: "bg-chart-2", hex: "#3B82F6" },
  { name: "График: янтарный", cls: "bg-chart-3", hex: "#F59E0B" },
  { name: "График: фиолетовый", cls: "bg-chart-4", hex: "#8B5CF6" },
];

const statuses = [
  { name: "Завершено", cls: "bg-[var(--status-done)]" },
  { name: "В работе", cls: "bg-[var(--status-wip)]" },
  { name: "В ожидании", cls: "bg-[var(--status-todo)]" },
  { name: "Просрочено", cls: "bg-[var(--status-overdue)]" },
];

export default function StyleguidePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Styleguide</h1>
        <p className="text-muted-foreground">
          Витрина дизайн-токенов по спеке спринта 1.1 (референс Logip).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Палитра</CardTitle>
          <CardDescription>Согласованные цвета (спека, п.3)</CardDescription>
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
          <CardDescription>Inter, полная кириллица; цифры — tabular-nums</CardDescription>
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
          <CardTitle>Кнопки и статусы</CardTitle>
          <CardDescription>shadcn-варианты + статусы план-факта</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Основная</Button>
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
        </CardContent>
      </Card>
    </div>
  );
}
