import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface DangerZoneCardProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function DangerZoneCard({ title, description, action }: DangerZoneCardProps) {
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="p-1.5 px-sp-2 flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-medium text-foreground">{title}</p>
            <p className="text-caption text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        {action && <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:justify-end sm:self-start">{action}</div>}
      </CardContent>
    </Card>
  );
}
