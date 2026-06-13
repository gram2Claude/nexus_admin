import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { listChats, resolveChatScope } from "@/server/chats";

import type { ProjectOption } from "./bind-chat-dialog";
import { ChatsList } from "./chats-list";

export const dynamic = "force-dynamic"; // живые привязки чатов — без пререндера

export default async function ChatsPage() {
  // resolveChatScope: owner/admin — все чаты, employee — свои проекты, client — null
  const scope = await resolveChatScope();
  if (!scope) redirect("/projects"); // Client доступа к разделу «Чаты» не имеет

  const session = await auth();
  const canBind = can.bindChats(session?.user?.role ?? "client");
  const chats = await listChats(scope);

  // проекты для селектора привязки нужны только тем, кто привязывает (owner/admin)
  const projects: ProjectOption[] = canBind
    ? (
        await db.query<ProjectOption>(
          "SELECT slug, name FROM nexus_admin.projects WHERE NOT archived ORDER BY name"
        )
      ).rows
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ChatsList chats={chats} projects={projects} canBind={canBind} />
    </div>
  );
}
