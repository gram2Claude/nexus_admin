"use client";

import { Copy, RotateCw, Trash2, UserPlus } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { changeRole, deleteUser, inviteUser, reinviteUser, type InviteResult } from "./actions";

export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "employee" | "client";
  status: "invited" | "active" | "disabled";
  created_at: string;
};

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  employee: "Employee",
  client: "Client",
};

function InviteLink({ result }: { result: InviteResult }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!result.link) return null;
  const url = `${window.location.origin}${result.link}`;
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 p-3">
      <span className="text-sm font-medium">
        Ссылка для {result.email} (показывается один раз):
      </span>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={url}
          className="text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              // вне secure context (HTTP по IP) clipboard API недоступен — выделяем для ручного копирования
              inputRef.current?.select();
            }
          }}
        >
          <Copy className="size-4" />
          {copied ? "Скопировано" : "Копировать"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">
        Письмо не отправляется — передай ссылку сам. Срок действия — 7 дней.
      </span>
    </div>
  );
}

function InviteForm({
  invitableRoles,
}: {
  invitableRoles: readonly ("admin" | "employee" | "client")[];
}) {
  const [inviteResult, formAction, invitePending] = useActionState(inviteUser, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inv-email" className="text-sm font-medium">
          Email *
        </label>
        <Input id="inv-email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="inv-name" className="text-sm font-medium">
          Имя
        </label>
        <Input id="inv-name" name="name" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Роль *</label>
        <Select name="role" defaultValue="employee">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {invitableRoles.map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabels[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {inviteResult?.error && <p className="text-sm text-destructive">{inviteResult.error}</p>}
      {inviteResult?.link && <InviteLink result={inviteResult} />}
      <Button type="submit" disabled={invitePending}>
        {invitePending ? "Создаём…" : "Создать приглашение"}
      </Button>
    </form>
  );
}

export function UsersTable({
  users,
  actorId,
  canAssignAdmin,
}: {
  users: UserRow[];
  actorId: string;
  canAssignAdmin: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [reinviteLinks, setReinviteLinks] = useState<Record<string, InviteResult>>({});
  const [actionError, setActionError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const invitableRoles = canAssignAdmin
    ? (["admin", "employee", "client"] as const)
    : (["employee", "client"] as const);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Пользователи</h1>
          <p className="text-sm text-muted-foreground">
            Доступ в кабинет — только по приглашению
          </p>
        </div>
        <Dialog
          open={inviteOpen}
          onOpenChange={(o) => {
            setInviteOpen(o);
            // ремоунт формы при каждом открытии — ссылка прошлого инвайта не «залипает» (ревью 2.2)
            if (o) setFormKey((k) => k + 1);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4" />
              Пригласить
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Пригласить пользователя</DialogTitle>
              <DialogDescription>
                Будет создана одноразовая ссылка установки пароля (7 дней).
              </DialogDescription>
            </DialogHeader>
            <InviteForm key={formKey} invitableRoles={invitableRoles} />
          </DialogContent>
        </Dialog>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Имя</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const isOwner = u.role === "owner";
              const isSelf = u.id === actorId;
              // согласовано с canModifyUser: admin не трогает другого admin (ревью 2.2)
              const editable = !isOwner && !isSelf && (canAssignAdmin || u.role !== "admin");
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell>
                    {editable ? (
                      <Select
                        key={`${u.id}-${u.role}`}
                        defaultValue={u.role}
                        disabled={pending}
                        onValueChange={(v) =>
                          startTransition(async () => {
                            const r = await changeRole(u.id, v);
                            setActionError(r.error);
                          })
                        }
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {invitableRoles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabels[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={isOwner ? "default" : "secondary"}>
                        {roleLabels[u.role]}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1.5">
                      <span
                        className={`size-2 rounded-full ${
                          u.status === "active"
                            ? "bg-[var(--status-done)]"
                            : u.status === "invited"
                              ? "bg-[var(--status-todo)]"
                              : "bg-[var(--status-overdue)]"
                        }`}
                      />
                      {u.status === "active"
                        ? "активен"
                        : u.status === "invited"
                          ? "приглашён"
                          : "отключён"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <div className="flex items-center justify-end gap-1">
                        {u.status === "invited" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                const r = await reinviteUser(u.id);
                                setActionError(r.error);
                                if (r.link) setReinviteLinks((m) => ({ ...m, [u.id]: r }));
                              })
                            }
                          >
                            <RotateCw className="size-3.5" />
                            инвайт
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" disabled={pending}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить {u.email}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Пользователь потеряет доступ в кабинет. Действие необратимо.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  startTransition(async () => {
                                    const r = await deleteUser(u.id);
                                    setActionError(r.error);
                                    if (!r.error) {
                                      // погасшие ссылки удалённого не должны висеть на экране (ревью 2.2)
                                      setReinviteLinks((m) => {
                                        const next = { ...m };
                                        delete next[u.id];
                                        return next;
                                      });
                                    }
                                  })
                                }
                              >
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {Object.entries(reinviteLinks).map(([id, r]) => (
        <InviteLink key={id} result={r} />
      ))}
    </div>
  );
}
