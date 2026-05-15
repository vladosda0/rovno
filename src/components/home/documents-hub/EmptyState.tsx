import type { LucideIcon, ReactNode } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ComponentType } from "react";

interface EmptyStateProps {
  icon: LucideIcon | ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, cta }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-muted p-4 text-muted-foreground">
          <Icon className="h-8 w-8" aria-hidden="true" />
        </div>
        <h3 className="text-h3 text-foreground">{title}</h3>
        <p className="max-w-prose text-body-sm text-muted-foreground whitespace-pre-line">
          {body}
        </p>
        {cta && <div className="mt-1">{cta}</div>}
      </CardContent>
    </Card>
  );
}
