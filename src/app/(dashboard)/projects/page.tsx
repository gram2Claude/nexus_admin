import { FolderKanban } from "lucide-react";

import { SectionStub } from "@/components/layout/section-stub";

export default function ProjectsPage() {
  return (
    <SectionStub
      icon={FolderKanban}
      title="Проекты"
      description="Обзор активных проектов, Гант и drill-down до моделей AI появятся в эпохах 4–5 (NEXADM-20…29)."
    />
  );
}
