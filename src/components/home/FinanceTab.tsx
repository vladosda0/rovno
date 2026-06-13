import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileDown } from "lucide-react";
import { usePortfolioFinanceSnapshot } from "@/hooks/use-portfolio-finance-snapshot";
import { PortfolioScorecard } from "@/components/home/PortfolioScorecard";
import { PortfolioPipeline } from "@/components/home/PortfolioPipeline";
import { PortfolioProjectList } from "@/components/home/PortfolioProjectList";

// The portfolio aggregates a single workspace; the app is RUB-only end to end.
const PORTFOLIO_CURRENCY = "RUB";

function ScorecardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-20 animate-pulse rounded-lg bg-muted/40" />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

export function FinanceTab() {
  const { t } = useTranslation();
  const { snapshot, isLoading, isError, refetch } = usePortfolioFinanceSnapshot();

  if (isLoading || (!snapshot && !isError)) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <ScorecardSkeleton />
      </div>
    );
  }

  if (isError || !snapshot) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-[13px] text-muted-foreground">{t("financeTab.error")}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>{t("financeTab.retry")}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PortfolioScorecard snapshot={snapshot} currency={PORTFOLIO_CURRENCY} />
      <PortfolioPipeline pipeline={snapshot.pipeline} currency={PORTFOLIO_CURRENCY} />
      <PortfolioProjectList projects={snapshot.projects} />

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link to="/home?tab=procurement" className="inline-flex items-center gap-1">
            {t("financeTab.viewProcurement")} <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
        <Button variant="outline" size="sm" disabled>
          <FileDown className="h-3.5 w-3.5 mr-1.5" /> {t("financeTab.export")}
          <Badge variant="secondary" className="ml-1.5 text-[9px]">{t("financeTab.soon")}</Badge>
        </Button>
      </div>
    </div>
  );
}
