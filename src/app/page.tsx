import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>nexus_admin</CardTitle>
          <CardDescription>
            Личный кабинет управленца — каркас приложения (NEXADM-1)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge>Next.js 16</Badge>
          <Badge variant="secondary">Tailwind 4</Badge>
          <Badge variant="outline">shadcn/ui</Badge>
          <Button size="sm">Проверка</Button>
        </CardContent>
      </Card>
    </main>
  );
}
