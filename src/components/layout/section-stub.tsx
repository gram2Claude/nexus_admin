import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SectionStub({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Card className="mx-auto mt-12 w-full max-w-lg text-center">
      <CardHeader className="items-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">Раздел в разработке</Badge>
      </CardContent>
    </Card>
  );
}
