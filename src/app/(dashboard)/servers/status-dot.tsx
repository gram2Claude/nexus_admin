// Светофор сервера: ok / warning / critical / нет данных. Чистый презентационный
// компонент — используется и в серверных, и в клиентских компонентах раздела.
const COLORS: Record<string, string> = {
  ok: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

const LABELS: Record<string, string> = {
  ok: "OK",
  warning: "Warning",
  critical: "Critical",
};

export function StatusDot({ status }: { status: string | null }) {
  const color = status ? COLORS[status] : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`size-2.5 shrink-0 rounded-full ${color ?? "bg-muted-foreground/40"}`}
        aria-hidden
      />
      <span className="text-sm">{status ? LABELS[status] ?? status : "нет данных"}</span>
    </span>
  );
}
