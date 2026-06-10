import { BookOpen } from "lucide-react";

import { SectionStub } from "@/components/layout/section-stub";

export default function KnowledgePage() {
  return (
    <SectionStub
      icon={BookOpen}
      title="База знаний"
      description="Раздел запланирован после первой очереди — описание добавит управленец по мере продвижения."
    />
  );
}
