"use client";

import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SeriesPoint } from "@/server/servers";

// Графики CPU/RAM/диск с переключателем день/неделя/месяц (SRVCHK-12).
// recharts — первая графиковая зависимость кабинета; цвета — токены темы
// --chart-N (работают в светлой и тёмной теме без прокидывания руками).

type Period = "day" | "week" | "month";

const PERIOD_LABELS: Record<Period, string> = { day: "День", week: "Неделя", month: "Месяц" };

function fmtBucket(iso: string, period: Period): string {
  const d = new Date(iso);
  if (period === "day") return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (period === "week") return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function toChartData(points: SeriesPoint[], period: Period) {
  return points.map((p) => ({
    label: fmtBucket(p.bucket, period),
    cpu: p.cpu_avg == null ? null : Number(p.cpu_avg),
    cpuMax: p.cpu_max == null ? null : Number(p.cpu_max),
    mem: p.mem_avg == null ? null : Number(p.mem_avg),
    memMax: p.mem_max == null ? null : Number(p.mem_max),
    disk: p.disk_avg == null ? null : Number(p.disk_avg),
  }));
}

function MetricChart({
  data, avgKey, maxKey, title, color,
}: {
  data: ReturnType<typeof toChartData>;
  avgKey: "cpu" | "mem" | "disk";
  maxKey?: "cpuMax" | "memMax";
  title: string;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-48 pl-0">
        {data.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
            нет данных за период
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)"
                minTickGap={32} />
              <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)" width={44} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)", border: "1px solid var(--border)",
                  borderRadius: 8, color: "var(--foreground)", fontSize: 12,
                }}
                formatter={(value, name) => [`${value ?? "—"}%`, String(name)]}
              />
              {maxKey && (
                <Line type="monotone" dataKey={maxKey} name="пик" stroke={color}
                  strokeOpacity={0.35} strokeWidth={1} dot={false} isAnimationActive={false} />
              )}
              <Line type="monotone" dataKey={avgKey} name="среднее" stroke={color}
                strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function ServerCharts({
  series,
}: {
  series: { day: SeriesPoint[]; week: SeriesPoint[]; month: SeriesPoint[] };
}) {
  const [period, setPeriod] = useState<Period>("day");
  const data = toChartData(series[period], period);

  return (
    <div className="grid gap-3">
      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <TabsList>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <TabsTrigger key={p} value={p}>
              {PERIOD_LABELS[p]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="grid gap-3 lg:grid-cols-3">
        <MetricChart data={data} avgKey="cpu" maxKey="cpuMax" title="CPU, %" color="var(--chart-1)" />
        <MetricChart data={data} avgKey="mem" maxKey="memMax" title="Память, %" color="var(--chart-2)" />
        <MetricChart data={data} avgKey="disk" title="Диск, %" color="var(--chart-3)" />
      </div>
    </div>
  );
}
