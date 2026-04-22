import { CheckCircle2, Lock, ClipboardList, FileText, ShoppingCart, Image, ListChecks } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { CommitResultItem } from "@/lib/commit-proposal";

const entityIcons: Record<string, typeof ClipboardList> = {
  task: ClipboardList,
  procurement_item: ShoppingCart,
  document: FileText,
  estimate_version: ListChecks,
  media: Image,
};

interface ResultCardProps {
  summary: string;
  items: CommitResultItem[];
  timestamp: string;
  canNavigate?: boolean;
}

export function ResultCard({ summary, items, timestamp, canNavigate = true }: ResultCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const time = new Date(timestamp).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="glass rounded-card p-3 space-y-2 w-full box-border">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <span className="text-body-sm font-semibold text-foreground">{t("ai.result.applied")}</span>
      </div>
      <p className="text-body-sm text-foreground">{summary}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = entityIcons[item.type] ?? FileText;
          const clickable = canNavigate && !!item.route;

          return (
            <button
              key={item.id}
              disabled={!clickable}
              onClick={() => clickable && navigate(item.route!)}
              className={`flex items-center gap-2 w-full text-left rounded-md px-2 py-1.5 text-body-sm transition-colors ${
                clickable
                  ? "hover:bg-accent/10 cursor-pointer"
                  : "cursor-default opacity-70"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {!clickable && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </button>
          );
        })}
      </div>
      <p className="text-caption text-muted-foreground">{t("ai.result.savedToLog", { time })}</p>
    </div>
  );
}
