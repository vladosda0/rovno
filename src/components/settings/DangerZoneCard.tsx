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
      <CardContent className="p-sp-2 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-body-sm font-medium text-foreground">{title}</p>
          <p className="text-caption text-muted-foreground mt-0.5">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
