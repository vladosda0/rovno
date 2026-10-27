import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileChartColumn } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatReportDay, formatReportPeriod } from "@/lib/client-report-format";
import type { SharedReportListItem } from "@/data/client-report-source";
import { reportPath } from "@/lib/project-reports";

interface Props {
  projectId: string;
  /** Latest first, as get-project-report returns them. */
  reports: SharedReportListItem[];
  isLoading: boolean;
  isError: boolean;
  /** Four on the dashboard's right column, two on a phone or under «Бюджет». */
  maxItems: number;
  className?: string;
}

// The viewer's published client reports on the project dashboard (rovno#237).
// Same pattern as DocsWidget.
export function ReportsWidget({ projectId, reports, isLoading, isError, maxItems, className }: Props) {
  const { t, i18n } = useTranslation();
  const items = reports.slice(0, maxItems).map((report) => ({
    ...report,
    label: formatReportPeriod(report.period_start, report.period_end, i18n.language),
  }));
  const labelCounts = new Map<string, number>();
  items.forEach((item) => labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1));

  return (
    <div className={cn("glass rounded-card p-sp-2 h-full flex flex-col", className)}>
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <FileChartColumn className="h-4 w-4 text-accent" /> {t("reportsWidget.title")}
        </h3>
        {items.length > 0 && (
          <Link
            to={reportPath(projectId)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent hover:bg-accent/10 transition-colors"
            aria-label={t("reportsWidget.openLatestAria")}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="flex-1">
        {isLoading ? (
          <div className="space-y-1.5" aria-busy="true">
            <Skeleton className="h-8 w-full rounded-panel" />
            <Skeleton className="h-8 w-full rounded-panel" />
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-1.5">
            {items.map((report, index) => (
              <Link
                key={report.id}
                to={reportPath(projectId, report.id)}
                className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2 hover:bg-muted/70 transition-colors"
              >
                <FileChartColumn className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-caption text-foreground flex-1 truncate">
                  {t("clientReport.view.metaNoAuthor", { period: report.label })}
                  {(labelCounts.get(report.label) ?? 0) > 1 && ` · ${formatReportDay(report.published_at, i18n.language)}`}
                </span>
                {index === 0 && (
                  <span className="inline-flex items-center rounded-pill bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                    {t("reportsWidget.latest")}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : isError ? (
          <p className="text-caption text-muted-foreground text-center py-sp-2">{t("clientReport.page.errorTitle")}</p>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-sp-2 text-center">
            <div className="mb-1 rounded-panel bg-muted p-1.5">
              <FileChartColumn className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-caption font-medium text-foreground">{t("reportsWidget.emptyTitle")}</p>
            <p className="text-caption text-muted-foreground">{t("reportsWidget.emptyBody")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
