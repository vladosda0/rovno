import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, ArrowRight } from "lucide-react";
import * as store from "@/data/store";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  purchased: { label: "Delivered", color: "bg-success/15 text-success" },
  not_purchased: { label: "Not purchased", color: "bg-warning/15 text-warning" },
};

export function ProcurementTab() {
  const projects = store.getProjects();
  const allItems = store.getAllProcurementItems();

  const grouped = useMemo(() => {
    const map: Record<string, typeof allItems> = {};
    for (const item of allItems) {
      if (!map[item.project_id]) map[item.project_id] = [];
      map[item.project_id].push(item);
    }
    return map;
  }, [allItems]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-accent" />
        <h2 className="text-body font-semibold text-foreground">All Procurement</h2>
        <Badge variant="secondary" className="text-caption">{allItems.length} items</Badge>
      </div>

      {projects.map((p) => {
        const items = grouped[p.id];
        if (!items?.length) return null;
        return (
          <Card key={p.id}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4">
                <h3 className="text-body-sm font-semibold text-foreground">{p.title}</h3>
                <Link to={`/project/${p.id}/procurement`} className="text-caption text-accent hover:underline flex items-center gap-1">
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-border px-4 pb-4 sm:px-6 sm:pb-6">
                {items.map((item) => {
                  const st = STATUS_LABELS[item.status] || { label: item.status, color: "bg-muted text-muted-foreground" };
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-foreground truncate">{item.title}</p>
                        <p className="text-caption text-muted-foreground">{item.qty} {item.unit} · ₽{item.cost.toLocaleString()}</p>
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

      {allItems.length === 0 && (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <p className="text-caption text-muted-foreground py-8 text-center">No procurement items across projects.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
