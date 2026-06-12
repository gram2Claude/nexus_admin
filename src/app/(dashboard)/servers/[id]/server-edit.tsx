"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { ServerOverview } from "@/server/servers";

import { updateServer, type ServerFormResult } from "../actions";
import { ServerFormFields } from "../servers-list";

export function ServerEditDialog({ server }: { server: ServerOverview }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ServerFormResult | undefined, formData: FormData) => {
      const res = await updateServer(server.id, prev, formData);
      if (!res.error) setOpen(false);
      return res;
    },
    undefined
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Редактировать
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Сервер: {server.name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <ServerFormFields server={server} />
          </div>
          {state?.error && <p className="pb-2 text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
