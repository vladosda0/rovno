import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

import { formatPct } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import type { PortfolioProjectRow, PortfolioRiskFlag } from "@/lib/finance/portfolio-read-model";

type SortKey = "margin" | "utilization" | "progress" | "risk";

interface Props {
  projects: PortfolioProjectRow[];
}

const RISK_LABEL_KEY: Record<PortfolioRiskFlag, string> = {
  overspend: "financeTab.riskOverspend",
  behind: "financeTab.riskBehind",
  thin_margin: "financeTab.riskThinMargin",
};

function sortValue(row: PortfolioProjectRow, key: SortKey): number {
  switch (key) {
    case "margin":
      // Ascending margin (worst first); redacted/unknown sink to the bottom.
      return row.marginPct ?? Number.POSITIVE_INFINITY;
    case "utilization":
      return -(row.percentSpent ?? -1);
    case "progress":
      return -(row.percentComplete ?? -1);
    case "risk":
      return -row.riskFlags.length;
  }
}

export function PortfolioProjectList({ projects }: Props) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("risk");

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => {
      const delta = sortValue(a, sortKey) - sortValue(b, sortKey);
      if (delta !== 0) return delta;
      return a.title.localeCompare(b.title);
    });
  }, [projects, sortKey]);

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    { key: "risk", label: t("financeTab.sortRisk") },
    { key: "margin", label: t("financeTab.sortMargin") },
    { key: "utilization", label: t("financeTab.sortUtilization") },
    { key: "progress", label: t("financeTab.sortProgress") },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-medium text-foreground">{t("financeTab.projects")}</h3>
        <div className="flex flex-wrap gap-1">
          {sortOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSortKey(option.key)}
              className={cn(
                "rounded-md px-2 py-1 text-[13px] transition-colors",
                sortKey === option.key
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg border border-border/70">
        {sorted.map((project) => {
          const redacted = project.financeVisibility !== "detail";
          return (
            <Link
              key={project.projectId}
              to={`/project/${project.projectId}/estimate`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-[15px] hover:bg-muted/20"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{project.title}</p>
                {redacted ? (
                  <p className="text-[13px] text-muted-foreground">{t("financeTab.financialDetailsHidden")}</p>
                ) : (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground tabular-nums">
                    <span>{t("financeTab.colMargin")}: {formatPct(project.marginPct, 1)}</span>
                    <span>{t("financeTab.colUtilization")}: {formatPct(project.percentSpent, 0)}</span>
                    <span>{t("financeTab.colProgress")}: {formatPct(project.percentComplete, 0)}</span>
                    {project.riskFlags.map((flag) => (
                      <span key={flag} className="font-medium text-destructive">
                        {t(RISK_LABEL_KEY[flag])}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
        {sorted.length === 0 && (
          <div className="px-3 py-6 text-[15px] text-muted-foreground">{t("financeTab.empty")}</div>
        )}
      </div>
    </div>
  );
}
