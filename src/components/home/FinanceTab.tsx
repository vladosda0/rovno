import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight, FileDown } from "lucide-react";
import * as store from "@/data/store";
import { useProcurementReadSnapshot } from "@/hooks/use-procurement-read-model";

export function FinanceTab() {
  const projects = store.getProjects();
  const procurementSnapshot = useProcurementReadSnapshot();

  const stats = useMemo(() => {
    let totalBudget = 0;
    let totalSpent = 0;

    for (const p of projects) {
      const est = store.getEstimate(p.id);
      if (!est) continue;
      for (const v of est.versions) {
        if (v.status !== "approved") continue;
        for (const item of v.items) {
          totalBudget += item.planned_cost;
          totalSpent += item.paid_cost;
        }
      }
    }
    return { totalBudget, totalSpent, variance: totalBudget - totalSpent };
  }, [projects]);

  const procSpend = procurementSnapshot.totals.inStockActualTotal;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-accent" />
              <span className="text-caption text-muted-foreground">Total Budget</span>
            </div>
            <p className="text-h3 font-bold text-foreground">₽{stats.totalBudget.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-caption text-muted-foreground">Actual Spend</span>
            </div>
            <p className="text-h3 font-bold text-foreground">₽{stats.totalSpent.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-caption text-muted-foreground">Variance</span>
            </div>
            <p className={`text-h3 font-bold ${stats.variance >= 0 ? "text-success" : "text-destructive"}`}>
              ₽{stats.variance.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-project breakdown */}
      <Card>
        <CardContent className="p-0">
          <h3 className="px-4 pt-4 pb-3 text-body font-semibold text-foreground sm:px-6 sm:pt-6 sm:pb-4">Budget by Project</h3>
          <div className="divide-y divide-border px-4 pb-4 sm:px-6 sm:pb-6">
            {projects.map((p) => {
              const est = store.getEstimate(p.id);
              if (!est) return null;
              let budget = 0, spent = 0;
              for (const v of est.versions) {
                if (v.status !== "approved") continue;
                for (const item of v.items) { budget += item.planned_cost; spent += item.paid_cost; }
              }
              if (budget === 0) return null;
              const pct = Math.round((spent / budget) * 100);
              return (
                <div key={p.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">{p.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-caption text-muted-foreground">Budget: ₽{budget.toLocaleString()}</span>
                      <span className="text-caption text-muted-foreground">Spent: ₽{spent.toLocaleString()}</span>
                      <Badge variant={pct > 90 ? "destructive" : "secondary"} className="text-[10px]">{pct}%</Badge>
                    </div>
                  </div>
                  <Link to={`/project/${p.id}/estimate`} className="text-caption text-accent hover:underline flex items-center gap-1 shrink-0">
                    Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Links */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link to="/home?tab=procurement">View procurement spend</Link>
        </Button>
        <Button variant="outline" size="sm" disabled>
          <FileDown className="h-3.5 w-3.5 mr-1.5" /> Export
          <Badge variant="secondary" className="ml-1.5 text-[9px]">Soon</Badge>
        </Button>
      </div>
    </div>
  );
}
