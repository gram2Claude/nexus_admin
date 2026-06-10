import { Banknote } from "lucide-react";

import { SectionStub } from "@/components/layout/section-stub";

export default function SalesPage() {
  return (
    <SectionStub
      icon={Banknote}
      title="Отдел продаж"
      description="Раздел запланирован после первой очереди — описание добавит управленец по мере продвижения."
    />
  );
}
