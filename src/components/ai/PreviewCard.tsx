import { Plus, Pencil, Trash2, FileText, ShoppingCart, ClipboardList } from "lucide-react";
import type { ProposalChange } from "@/types/ai";

const iconMap: Record<string, typeof Plus> = {
  task: ClipboardList,
  estimate_item: FileText,
  procurement_item: ShoppingCart,
  document: FileText,
};

const actionColors: Record<string, string> = {
  create: "text-success",
  update: "text-warning",
  delete: "text-destructive",
};

const actionIcons: Record<string, typeof Plus> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

interface PreviewCardProps {
  summary: string;
  changes: ProposalChange[];
}

export function PreviewCard({ summary, changes }: PreviewCardProps) {
  return (
    <div className="glass rounded-card p-sp-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-semibold text-foreground">{summary}</span>
        <span className="text-caption text-muted-foreground">{changes.length} change{changes.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-1">
        {changes.map((change, i) => {
          const ActionIcon = actionIcons[change.action] ?? Plus;
          const EntityIcon = iconMap[change.entity_type] ?? FileText;
          const color = actionColors[change.action] ?? "text-muted-foreground";

          return (
            <div key={i} className="flex items-center gap-2 text-body-sm py-1 px-2 rounded-md bg-muted/30">
              <ActionIcon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
              <EntityIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{change.label}</span>
              {change.before && change.after && (
                <span className="text-caption text-muted-foreground shrink-0">
                  <span className="line-through">{change.before}</span>
                  {" → "}
                  <span className="text-foreground">{change.after}</span>
                </span>
              )}
              {!change.before && change.after && (
                <span className="text-caption text-muted-foreground shrink-0">{change.after}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
