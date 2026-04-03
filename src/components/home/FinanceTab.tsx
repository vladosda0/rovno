import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, ArrowRight, FileDown } from "lucide-react";
import { useEstimateV2FinanceSnapshot } from "@/hooks/use-estimate-v2-data";

function formatCurrency(valueCents: number, currency = "RUB") {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

export function FinanceTab() {
  const snapshot = useEstimateV2FinanceSnapshot();
  const displayCurrency = snapshot.projects[0]?.currency ?? "RUB";
  const projectRows = snapshot.projects.filter((summary) => summary.hasEstimate && summary.plannedBudgetCents > 0);

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
            <p className="text-h3 font-bold text-foreground">{formatCurrency(snapshot.totals.plannedBudgetCents, displayCurrency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-caption text-muted-foreground">Actual Spend</span>
            </div>
            <p className="text-h3 font-bold text-foreground">{formatCurrency(snapshot.totals.spentCents, displayCurrency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-caption text-muted-foreground">Variance</span>
            </div>
            <p className={`text-h3 font-bold ${snapshot.totals.varianceCents >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(snapshot.totals.varianceCents, displayCurrency)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-project breakdown */}
      <Card>
        <CardContent className="p-0">
          <h3 className="px-4 pt-4 pb-3 text-body font-semibold text-foreground sm:px-6 sm:pt-6 sm:pb-4">Budget by Project</h3>
          <div className="divide-y divide-border px-4 pb-4 sm:px-6 sm:pb-6">
            {projectRows.map((project) => {
              return (
                <div key={project.projectId} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">{project.projectTitle}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-caption text-muted-foreground">Budget: {formatCurrency(project.plannedBudgetCents, project.currency)}</span>
                      <span className="text-caption text-muted-foreground">Spent: {formatCurrency(project.spentCents, project.currency)}</span>
                      <Badge variant={project.percentSpent > 90 ? "destructive" : "secondary"} className="text-[10px]">{project.percentSpent}%</Badge>
                    </div>
                  </div>
                  <Link to={`/project/${project.projectId}/estimate`} className="text-caption text-accent hover:underline flex items-center gap-1 shrink-0">
                    Details <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
            {projectRows.length === 0 && (
              <div className="py-6 text-body-sm text-muted-foreground">
                No estimate budget data yet. Create an estimate to see finance summaries here.
              </div>
            )}
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
