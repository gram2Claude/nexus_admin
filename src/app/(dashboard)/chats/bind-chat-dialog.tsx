"use client";

import { Link2, Unlink } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { bindChat, unbindChat } from "./actions";

export type ProjectOption = { slug: string; name: string };
export type ChatForBinding = {
  chat_id: string;
  chat_title: string;
  project_slug: string | null;
};

/** Диалог привязки/отвязки чата к проекту (RBAC owner/admin — рендерится только им, TIME-75). */
export function BindChatDialog({
  chat,
  projects,
}: {
  chat: ChatForBinding;
  projects: ProjectOption[];
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(chat.project_slug ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const bound = chat.project_slug != null;

  function submitBind() {
    if (!slug) {
      setError("Выберите проект");
      return;
    }
    startTransition(async () => {
      const r = await bindChat(chat.chat_id, slug);
      setError(r.error);
      if (!r.error) setOpen(false);
    });
  }

  function submitUnbind() {
    startTransition(async () => {
      const r = await unbindChat(chat.chat_id);
      setError(r.error);
      if (!r.error) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // при открытии — сброс к текущему состоянию (не «залипает» прошлый выбор/ошибка)
        if (o) {
          setSlug(chat.project_slug ?? "");
          setError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={bound ? "outline" : "default"}>
          <Link2 className="size-4" />
          {bound ? "Изменить" : "Привязать"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Привязка чата к проекту</DialogTitle>
          <DialogDescription>
            «{chat.chat_title || chat.chat_id}» → проект. Привязка кабинета приоритетна над
            автоматической (ботовой).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Select value={slug} onValueChange={setSlug} disabled={pending}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите проект" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {bound ? (
            <Button
              variant="ghost"
              onClick={submitUnbind}
              disabled={pending}
              className="text-destructive"
            >
              <Unlink className="size-4" />
              Отвязать
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submitBind} disabled={pending}>
            {pending ? "Сохраняю…" : bound ? "Сохранить" : "Привязать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
