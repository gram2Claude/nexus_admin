import { UserCog } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { SectionStub } from "@/components/layout/section-stub";
import { can } from "@/lib/rbac";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user || !can.manageUsers(session.user.role)) redirect("/projects");

  return (
    <SectionStub
      icon={UserCog}
      title="Пользователи"
      description="Управление пользователями, инвайты и роли появятся в эпохе 2 (NEXADM-8…11)."
    />
  );
}
