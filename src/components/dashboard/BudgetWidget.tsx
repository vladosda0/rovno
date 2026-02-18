import { Progress } from "@/components/ui/progress";
import type { Estimate } from "@/types/entities";

interface Props {
  estimate: Estimate | undefined;
}

export function BudgetWidget({ estimate }: Props) {
  const activeVersion = estimate?.versions.find((v) => v.status === "approved") ?? estimate?.versions[0];
  const totalPlanned = activeVersion?.items.reduce((s, i) => s + i.planned_cost, 0) ?? 0;
  const totalPaid = activeVersion?.items.reduce((s, i) => s + i.paid_cost, 0) ?? 0;
  const pct = totalPlanned > 0 ? Math.round((totalPaid / totalPlanned) * 100) : 0;

  if (!activeVersion) {
    return (
      <div className="glass rounded-card p-sp-2">
        <h3 className="text-body font-semibold text-foreground mb-sp-2">Budget</h3>
        <p className="text-body-sm text-muted-foreground">No estimate created yet</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-card p-sp-2">
      <h3 className="text-body font-semibold text-foreground mb-sp-2">Budget</h3>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="rounded-panel bg-muted/40 p-2 text-center">
          <p className="text-body-sm font-semibold text-foreground">₽{(totalPlanned / 1000).toFixed(0)}K</p>
          <p className="text-caption text-muted-foreground">Planned</p>
        </div>
        <div className="rounded-panel bg-muted/40 p-2 text-center">
          <p className="text-body-sm font-semibold text-foreground">₽{(totalPaid / 1000).toFixed(0)}K</p>
          <p className="text-caption text-muted-foreground">Paid</p>
        </div>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-caption text-muted-foreground mt-1">{pct}% spent</p>
    </div>
  );
}
