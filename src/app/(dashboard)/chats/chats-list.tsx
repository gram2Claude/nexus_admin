"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChatBinding } from "@/server/chats";

import { BindChatDialog, type ProjectOption } from "./bind-chat-dialog";
import { ChatContentDialog } from "./chat-content-dialog";

// timestamptz ::text → "2026-06-13 10:30:00.123+00"; режем до минут (детерминированно, без
// Date.now() — нет рассинхрона гидрации). Время в UTC, как в БД.
function fmtUpdated(ts: string): string {
  return `${ts.slice(0, 16)} UTC`;
}

export function ChatsList({
  chats,
  projects,
  canBind,
}: {
  chats: ChatBinding[];
  projects: ProjectOption[];
  canBind: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Чаты</CardTitle>
        <CardDescription>
          Telegram-чаты бота-конспектора и их привязка к проектам. Бот пишет дайджесты, темы и
          журнал решений; кабинет — источник истины привязок чат → проект.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chats.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Чатов пока нет — бот добавит их, как только начнёт конспектировать.
            {canBind && " Непривязанные чаты появятся здесь сверху для привязки к проекту."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Чат</TableHead>
                <TableHead>Проект</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Обновлён</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chats.map((c) => (
                <TableRow key={c.chat_id} className={c.active ? undefined : "opacity-60"}>
                  <TableCell>
                    <div className="font-medium">{c.chat_title || c.chat_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.chat_id}
                      {!c.active && " · скрыт"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.project_slug ? (
                      <Badge variant="secondary">{c.project_name ?? c.project_slug}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        не привязан
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.bound_via === "cabinet" ? "кабинет" : "бот"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {fmtUpdated(c.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {/* Просмотр контента — для привязанных чатов, всем кто видит строку */}
                      {c.project_slug && (
                        <ChatContentDialog
                          chat={{
                            chat_id: c.chat_id,
                            chat_title: c.chat_title,
                            project_name: c.project_name,
                          }}
                        />
                      )}
                      {/* Привязка/отвязка — только owner/admin */}
                      {canBind && (
                        <BindChatDialog
                          chat={{
                            chat_id: c.chat_id,
                            chat_title: c.chat_title,
                            project_slug: c.project_slug,
                          }}
                          projects={projects}
                        />
                      )}
                    </div>
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
