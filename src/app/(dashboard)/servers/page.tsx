import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { can } from "@/lib/rbac";
import { listServers } from "@/server/servers";

import { ServersList } from "./servers-list";

export const dynamic = "force-dynamic"; // живые метрики — без пререндера

export default async function ServersPage() {
  const session = await auth();
  if (!session?.user || !can.seeServers(session.user.role)) redirect("/projects");

  const servers = await listServers();

  return (
    <div className="mx-auto w-full max-w-6xl">
      <ServersList servers={servers} canManage={can.manageServers(session.user.role)} />
    </div>
  );
}
