import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ArrowRight } from "lucide-react";
import { fmtCost } from "@/lib/procurement-utils";
import { useHomeProcurementReadSnapshot } from "@/hooks/use-procurement-read-model";

const REDACTED_PLACEHOLDER = "—";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "Requested", color: "bg-warning/15 text-warning" },
  ordered: { label: "Ordered", color: "bg-info/15 text-info" },
  in_stock: { label: "In stock", color: "bg-success/15 text-success" },
};

export function ProcurementTab() {
  const { snapshot, sensitiveDetailLoading } = useHomeProcurementReadSnapshot();
  const allItemsCount = snapshot.totals.totalCount;

  if (sensitiveDetailLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-body-sm text-muted-foreground animate-pulse">Loading procurement access…</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-accent" />
        <h2 className="text-body font-semibold text-foreground">All Procurement</h2>
        <Badge variant="secondary" className="text-caption">{allItemsCount} items</Badge>
      </div>

      {snapshot.projects.map((project) => {
        if (!project.rows.length) return null;
        return (
          <Card key={project.projectId}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
                <h3 className="text-body-sm font-semibold text-foreground">{project.projectTitle}</h3>
                <Link to={`/project/${project.projectId}/procurement`} className="text-caption text-accent hover:underline flex items-center gap-1">
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-border px-4 pb-4 sm:px-6 sm:pb-6">
                {project.rows.map((row) => {
                  const st = STATUS_LABELS[row.status] || { label: row.status, color: "bg-muted text-muted-foreground" };
                  const showMoney = row.monetaryVisible !== false;
                  return (
                    <div key={row.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-foreground truncate">{row.name}</p>
                        <p className="text-caption text-muted-foreground">
                          {row.statusQty} {row.unit} · {showMoney ? fmtCost(row.statusTotal) : REDACTED_PLACEHOLDER}
                        </p>
                      </div>
                      <span className={`text-caption font-medium px-2 py-0.5 rounded-pill ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {allItemsCount === 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-caption text-muted-foreground py-8 text-center">No procurement items across projects.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
