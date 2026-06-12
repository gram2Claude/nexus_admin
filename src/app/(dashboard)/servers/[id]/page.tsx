import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { can } from "@/lib/rbac";
import {
  getAggregates, getIncidents, getInventory, getSeries, getServer,
  type Inventory, type Recommendation,
} from "@/server/servers";

import { StatusDot } from "../status-dot";
import { ServerCharts } from "./server-charts";
import { ServerEditDialog } from "./server-edit";

export const dynamic = "force-dynamic";

const INCIDENT_LABELS: Record<string, string> = {
  reboot: "Перезагрузка",
  oom: "OOM-killer",
  systemd_failed: "Сбой systemd-юнита",
  container_down: "Падение контейнера",
  unreachable: "Сервер недоступен",
  threshold_mem: "Память выше порога",
  threshold_disk: "Диск выше порога",
  threshold_load: "Load выше порога",
};

const PERIOD_LABELS: Record<string, string> = { day: "День", week: "Неделя", month: "Месяц" };

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function fmtGb(mb: number | null | undefined): string {
  if (mb == null) return "—";
  return `${(mb / 1024).toFixed(1)} GB`;
}

function pct(v: string | null): string {
  return v == null ? "—" : `${v}%`;
}

function InventoryBlock({ inv, mem }: { inv: Inventory | null; mem: { total: number | null; swap: number | null } }) {
  if (!inv) {
    return <p className="text-sm text-muted-foreground">Инвентарь ещё не собран (обновляется раз в сутки).</p>;
  }
  const rows: [string, React.ReactNode][] = [
    ["ОС", inv.os ?? "—"],
    ["Ядро", inv.kernel ?? "—"],
    ["CPU", `${inv.cpu_model ?? "—"} · ${inv.cpu_cores ?? "?"} ядро(а)`],
    ["RAM", fmtGb(inv.mem_total_mb ?? mem.total)],
    ["Swap", (inv.swap_total_mb ?? mem.swap) === 0 ? "отсутствует" : fmtGb(inv.swap_total_mb ?? mem.swap)],
    ["Диски", (inv.disks ?? []).map((d) => `${d.mount} ${(d.size_b / 1e9).toFixed(0)} GB`).join(", ") || "—"],
    ["Docker", inv.docker_version ?? "не установлен"],
    ["Контейнеры", (inv.containers ?? []).map((c) => `${c.name} (${c.state})`).join(", ") || "—"],
    ["Открытые порты", (inv.listen_ports ?? []).map((p) => `${p.port}${p.proc ? ` (${p.proc})` : ""}`).join(", ") || "—"],
    ["Последняя загрузка", inv.boot_since ?? "—"],
  ];
  return (
    <dl className="grid gap-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[160px_1fr] gap-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function VerdictBlock({
  status, recs, ts,
}: {
  status: string | null;
  recs: Recommendation[] | null;
  ts: string | null;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <StatusDot status={status} />
        <span className="text-xs text-muted-foreground">обновлён: {fmtTs(ts)}</span>
      </div>
      {recs && recs.length > 0 ? (
        <ul className="grid gap-1.5">
          {recs.map((r) => (
            <li key={r.code} className="flex items-start gap-2 text-sm">
              <Badge variant={r.severity === "critical" ? "destructive" : "secondary"} className="mt-0.5 shrink-0">
                {r.severity === "critical" ? "критично" : "внимание"}
              </Badge>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Рекомендаций нет — ресурсов хватает.
        </p>
      )}
    </div>
  );
}

export default async function ServerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !can.seeServers(session.user.role)) redirect("/projects");

  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [server, inventory, incidents, aggregates, series] = await Promise.all([
    getServer(id), getInventory(id), getIncidents(id), getAggregates(id), getSeries(id),
  ]);
  if (!server) notFound();

  const periodOrder = ["day", "week", "month"];
  const aggSorted = [...aggregates].sort(
    (a, b) => periodOrder.indexOf(a.period) - periodOrder.indexOf(b.period)
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{server.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[server.provider, server.purpose].filter(Boolean).join(" · ") || server.host}
            {!server.enabled && " · опрос выключен"}
          </p>
        </div>
        {can.manageServers(session.user.role) && <ServerEditDialog server={server} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Вердикт: нужно ли добавить мощностей</CardTitle>
          </CardHeader>
          <CardContent>
            <VerdictBlock
              status={server.last_ts ? server.verdict_status : null}
              recs={server.verdict_recommendations}
              ts={server.verdict_ts}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Сводка за периоды</CardTitle>
          </CardHeader>
          <CardContent>
            {aggSorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Период</TableHead>
                    <TableHead className="text-right">CPU ср/пик</TableHead>
                    <TableHead className="text-right">RAM ср/пик</TableHead>
                    <TableHead className="text-right">Диск</TableHead>
                    <TableHead className="text-right">Доступность</TableHead>
                    <TableHead className="text-right">Сбои</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggSorted.map((a) => (
                    <TableRow key={a.period}>
                      <TableCell>{PERIOD_LABELS[a.period]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(a.cpu_avg)} / {pct(a.cpu_max)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pct(a.mem_avg)} / {pct(a.mem_max)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{pct(a.disk_avg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(a.availability_pct)}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.incidents}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <ServerCharts series={series} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Параметры</CardTitle>
          </CardHeader>
          <CardContent>
            <InventoryBlock
              inv={inventory}
              mem={{ total: server.mem_total_mb, swap: server.swap_total_mb }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Журнал инцидентов</CardTitle>
          </CardHeader>
          <CardContent>
            {incidents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сбоев не зафиксировано.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Тип</TableHead>
                    <TableHead>Начало</TableHead>
                    <TableHead>Конец</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Badge
                            variant={i.severity === "critical" ? "destructive" : "secondary"}
                            className="shrink-0"
                          >
                            {i.severity === "critical" ? "крит" : "warn"}
                          </Badge>
                          {INCIDENT_LABELS[i.type] ?? i.type}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{fmtTs(i.started_at)}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {i.ended_at ? fmtTs(i.ended_at) : <Badge variant="destructive">открыт</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
