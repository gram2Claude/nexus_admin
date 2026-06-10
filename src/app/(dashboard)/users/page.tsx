import { UserCog } from "lucide-react";

import { SectionStub } from "@/components/layout/section-stub";

export default function UsersPage() {
  return (
    <SectionStub
      icon={UserCog}
      title="Пользователи"
      description="Управление пользователями, инвайты и роли появятся в эпохе 2 (NEXADM-8…11)."
    />
  );
}
