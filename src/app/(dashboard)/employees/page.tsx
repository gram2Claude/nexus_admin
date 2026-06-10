import { Users } from "lucide-react";

import { SectionStub } from "@/components/layout/section-stub";

export default function EmployeesPage() {
  return (
    <SectionStub
      icon={Users}
      title="Сотрудники"
      description="Раздел запланирован после первой очереди — описание добавит управленец по мере продвижения."
    />
  );
}
