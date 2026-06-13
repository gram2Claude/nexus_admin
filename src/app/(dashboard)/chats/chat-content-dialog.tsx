"use client";

import { FileText } from "lucide-react";
import { useState, useTransition } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getChatContent, type ChatContent } from "./actions";

// БЕЗОПАСНОСТЬ: react-markdown по умолчанию НЕ рендерит сырой HTML (rehype-raw не подключаем) —
// markdown бота не может протащить <script>/onerror (XSS-защита); URL санитайзятся встроенно
// (javascript: и пр. блокируются defaultUrlTransform). Стиль — Tailwind-селекторами потомков
// на обёртке (плагина typography в проекте нет), без components-маппинга (тот тянул бы prop
// `node` на DOM-элементы).
const MD_CLASS =
  "text-sm leading-relaxed break-words " +
  "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold " +
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold " +
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold " +
  "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:ml-5 [&_ul]:list-disc " +
  "[&_ol]:my-1.5 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:my-0.5 " +
  "[&_a]:text-primary [&_a]:underline " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:text-xs " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs " +
  "[&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium " +
  "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top";

function Md({ children }: { children: string }) {
  return (
    <div className={MD_CLASS}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

export function ChatContentDialog({
  chat,
}: {
  chat: { chat_id: string; chat_title: string; project_name: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ChatContent | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setContent(null);
          setError(undefined);
          startTransition(async () => {
            const r = await getChatContent(chat.chat_id);
            setError(r.error);
            setContent(r.content ?? null);
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <FileText className="size-4" />
          Просмотр
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{chat.project_name ?? chat.chat_title}</DialogTitle>
          <DialogDescription>
            Дайджесты, темы и журнал решений из чата «{chat.chat_title}»
          </DialogDescription>
        </DialogHeader>

        {pending && <Empty text="Загрузка…" />}
        {error && !pending && (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        )}
        {content && !pending && (
          <Tabs defaultValue="digests" className="flex min-h-0 flex-col">
            <TabsList>
              <TabsTrigger value="digests">Дайджесты ({content.digests.length})</TabsTrigger>
              <TabsTrigger value="topics">Темы ({content.topics.length})</TabsTrigger>
              <TabsTrigger value="journal">Журнал ({content.journal.length})</TabsTrigger>
            </TabsList>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              <TabsContent value="digests">
                {content.digests.length === 0 ? (
                  <Empty text="Дайджестов пока нет" />
                ) : (
                  <div className="flex flex-col gap-4">
                    {content.digests.map((d) => (
                      <div key={d.date}>
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          {d.date}
                        </div>
                        <Md>{d.content_md}</Md>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="topics">
                {content.topics.length === 0 ? (
                  <Empty text="Тем пока нет" />
                ) : (
                  <div className="flex flex-col gap-4">
                    {content.topics.map((t) => (
                      <div key={t.name}>
                        <div className="mb-1 text-sm font-semibold">{t.name}</div>
                        <Md>{t.content_md}</Md>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="journal">
                {content.journal.length === 0 ? (
                  <Empty text="Записей пока нет" />
                ) : (
                  <div className="flex flex-col gap-2">
                    {content.journal.map((j) => (
                      <div key={j.id} className="flex items-start gap-2 text-sm">
                        <Badge variant={j.kind === "decision" ? "secondary" : "outline"}>
                          {j.kind === "decision" ? "решение" : "пожелание"}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular-nums">{j.date}</span>
                        <span className="flex-1 whitespace-pre-wrap break-words">{j.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
