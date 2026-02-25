import { Link } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Estimate } from "@/types/entities";

interface Props {
  estimate: Estimate | undefined;
  projectId: string;
  className?: string;
}

function formatCurrency(value: number) {
  return `₽${value.toLocaleString("ru-RU")}`;
}

export function BudgetWidget({ estimate, projectId, className }: Props) {
  const activeVersion = estimate?.versions.find((v) => v.status === "approved") ?? estimate?.versions[0];

  if (!activeVersion) {
    return (
      <div className={cn("glass rounded-card p-sp-2 space-y-3", className)}>
        <h3 className="text-body font-semibold text-foreground">Budget</h3>
        <p className="text-body-sm text-muted-foreground">
          Plan your budget to track spending and upcoming payments.
        </p>
        <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={`/project/${projectId}/estimate`}>Start planning</Link>
        </Button>
      </div>
    );
  }

  const totalPlanned = activeVersion.items.reduce((sum, item) => sum + item.planned_cost, 0);
  const totalSpent = activeVersion.items.reduce((sum, item) => sum + item.paid_cost, 0);
  const toBePaid = Math.max(totalPlanned - totalSpent, 0);
  const spentPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

  const urgentUnpaid = activeVersion.items
    .map((item) => ({
      id: item.id,
      title: item.title,
      remaining: Math.max(item.planned_cost - item.paid_cost, 0),
    }))
    .filter((item) => item.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3);

  return (
    <div className={cn("glass rounded-card p-sp-2", className)}>
      <div className="flex items-center justify-between gap-2 mb-sp-2">
        <h3 className="text-body font-semibold text-foreground">Budget</h3>
        <Button asChild size="sm" variant="outline" className="h-7 text-caption">
          <Link to={`/project/${projectId}/estimate`}>Manage</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">Planned</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalPlanned)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">Spent</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">To be paid</p>
          <p className="text-body-sm font-semibold text-foreground">{formatCurrency(toBePaid)}</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2">
          <p className="text-[10px] text-muted-foreground">% spent</p>
          <p className="text-body-sm font-semibold text-foreground">{spentPct}%</p>
        </div>
      </div>

      <Progress value={spentPct} className="h-1.5" />

      {urgentUnpaid.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground">Urgent unpaid</p>
          {urgentUnpaid.map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-panel bg-muted/40 px-2 py-1">
              <span className="text-caption text-foreground flex-1 truncate">{item.title}</span>
              <span className="text-[10px] text-muted-foreground">{formatCurrency(item.remaining)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
