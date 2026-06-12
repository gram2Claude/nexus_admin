"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { ServerOverview } from "@/server/servers";

import { addServer, type ServerFormResult } from "./actions";
import { StatusDot } from "./status-dot";

function fmtPct(v: string | number | null): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(1).replace(/\.0$/, "")}%`;
}

function fmtAgo(ts: string | null): string {
  if (!ts) return "ещё не опрашивался";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  return `${Math.round(mins / 60)} ч назад`;
}

/** Форма сервера: общая для добавления и редактирования. Секреты НЕ принимаются —
 *  только имя ключа; сам ключ кладётся на машину координатора (Q3). */
export function ServerFormFields({ server }: { server?: ServerOverview }) {
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="name">Название</Label>
          <Input id="name" name="name" required defaultValue={server?.name} placeholder="nexus" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="host">Host (алиас/hostname/IP)</Label>
          <Input id="host" name="host" required defaultValue={server?.host} placeholder="nexus" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="port">SSH-порт</Label>
          <Input id="port" name="port" type="number" defaultValue={server?.port ?? 22} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ssh_user">Пользователь</Label>
          <Input id="ssh_user" name="ssh_user" defaultValue={server?.ssh_user ?? "root"} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="poll_interval_min">Период, мин</Label>
          <Input
            id="poll_interval_min" name="poll_interval_min" type="number"
            defaultValue={server?.poll_interval_min ?? 15}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="key_name">Имя SSH-ключа у координатора (опционально)</Label>
        <Input id="key_name" name="key_name" defaultValue={server?.key_name ?? ""} placeholder="алиас задаёт ключ сам" />
        <p className="text-xs text-muted-foreground">
          Сам ключ в кабинет не вводится: его кладут на машину координатора (политика безопасности).
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="provider">Провайдер</Label>
          <Input id="provider" name="provider" defaultValue={server?.provider ?? ""} placeholder="DigitalOcean" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="purpose">Назначение</Label>
          <Input id="purpose" name="purpose" defaultValue={server?.purpose ?? ""} placeholder="Сайт компании" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="enabled" name="enabled" type="checkbox" className="size-4 accent-primary"
          defaultChecked={server?.enabled ?? true}
          // value="on" по умолчанию; в action enabled = значение !== "off", отсутствие = off
          onChange={() => {}}
        />
        <Label htmlFor="enabled">Опрашивать сервер (enabled)</Label>
      </div>
    </div>
  );
}

function AddServerDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ServerFormResult | undefined, formData: FormData) => {
      const res = await addServer(prev, formData);
      if (!res.error) setOpen(false);
      return res;
    },
    undefined
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Добавить сервер
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Новый сервер</DialogTitle>
            <DialogDescription>
              Коллектор подхватит сервер на ближайшем цикле (≤ 15 мин) — статус подключения
              появится в списке после первого съёма.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <ServerFormFields />
          </div>
          {state?.error && <p className="pb-2 text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняю…" : "Добавить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServersList({
  servers,
  canManage,
}: {
  servers: ServerOverview[];
  canManage: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Серверы</CardTitle>
          <CardDescription>
            Ресурсы и состояние серверов: съём по SSH каждые ~15 минут с машины координатора
          </CardDescription>
        </div>
        {canManage && <AddServerDialog />}
      </CardHeader>
      <CardContent>
        {servers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Серверов пока нет — добавьте первый кнопкой выше. Если он только что добавлен,
            метрики появятся после ближайшего цикла коллектора.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Статус</TableHead>
                <TableHead>Сервер</TableHead>
                <TableHead className="text-right">CPU</TableHead>
                <TableHead className="text-right">RAM</TableHead>
                <TableHead className="text-right">Диск</TableHead>
                <TableHead className="text-right">Инциденты 24ч</TableHead>
                <TableHead>Последний съём</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <StatusDot status={s.last_ts ? s.verdict_status : null} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/servers/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[s.provider, s.purpose].filter(Boolean).join(" · ") || s.host}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(s.cpu_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(s.mem_used_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPct(s.disk_max_used_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(s.incidents_24h) > 0 ? (
                      <Badge variant={Number(s.incidents_open) > 0 ? "destructive" : "secondary"}>
                        {s.incidents_24h}
                      </Badge>
                    ) : (
                      "0"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {!s.enabled ? (
                      <Badge variant="outline">выключен</Badge>
                    ) : (
                      <span className={s.last_ok === false ? "text-destructive" : undefined}>
                        {fmtAgo(s.last_ts)}
                        {s.last_ok === false && " · сбой съёма"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
