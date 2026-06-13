import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatPct } from "@/lib/finance/format";
import { formatCompactMoney } from "@/lib/estimate-v2/format-money";
import { cn } from "@/lib/utils";
import { computePortfolioVerdict, type PortfolioVerdict } from "@/lib/finance/portfolio-verdict";
import { computeNewProjectFit } from "@/lib/finance/what-if";
import type { PortfolioFinanceSnapshot } from "@/lib/finance/portfolio-read-model";

interface Props {
  snapshot: PortfolioFinanceSnapshot;
  currency: string;
}

const VERDICT_STYLE: Record<PortfolioVerdict, string> = {
  go: "text-foreground",
  caution: "text-foreground",
  no: "text-destructive",
};

// A short, deliberately generic "why" per verdict (spec: horoscope-style guidance).
const VERDICT_DESC_KEY: Record<PortfolioVerdict, string> = {
  go: "financeTab.verdictDesc.go",
  caution: "financeTab.verdictDesc.caution",
  no: "financeTab.verdictDesc.no",
};

function rublesToCents(value: string): number | null {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function toNumberOrNull(value: string): number | null {
  const normalized = value.replace(",", ".");
  if (normalized.trim() === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * One decision panel that answers «брать ли новый проект». It shows a standing verdict from
 * the data the system already has, and recomputes the SAME verdict (with an analyzing status)
 * once the user supplies potential-project inputs.
 */
export function PortfolioDecisionPanel({ snapshot, currency }: Props) {
  const { t } = useTranslation();
  const money = (cents: number) => formatCompactMoney(cents, currency);

  const [contract, setContract] = useState("");
  const [marginPct, setMarginPct] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const contractCents = rublesToCents(contract);
  const marginValue = toNumberOrNull(marginPct);
  const hasNewProject = contractCents != null && contractCents > 0 && marginValue != null;

  const standing = useMemo(() => computePortfolioVerdict(snapshot), [snapshot]);
  const fit = useMemo(() => {
    if (!hasNewProject) return null;
    return computeNewProjectFit(snapshot, {
      contractCents,
      marginPct: marginValue,
      startDate: startDate || null,
      durationDays: toNumberOrNull(durationDays),
    });
  }, [snapshot, hasNewProject, contractCents, marginValue, startDate, durationDays]);

  // Brief "analyzing" status whenever the new-project inputs change, so the verdict reads as
  // freshly recomputed rather than silently swapping.
  useEffect(() => {
    if (!hasNewProject) {
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const timer = setTimeout(() => setAnalyzing(false), 500);
    return () => clearTimeout(timer);
  }, [hasNewProject, contractCents, marginValue, startDate, durationDays]);

  const verdict = fit ? fit.verdict : standing.verdict;
  const projected = Boolean(fit);

  return (
    <div className="space-y-3 rounded-lg border border-border/70 px-4 py-3">
      {/* Verdict hero — single verdict, updates with the new-project inputs. */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[15px] text-muted-foreground">
          {projected ? t("financeTab.verdictWithNewProject") : t("financeTab.verdictQuestion")}
          {analyzing && (
            <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("financeTab.analyzing")}
            </span>
          )}
        </span>
        <span className={cn("text-2xl font-medium transition-opacity", VERDICT_STYLE[verdict], analyzing && "opacity-40")}>
          {t(`financeTab.verdict.${verdict}`)}
        </span>
      </div>

      <p className="text-[15px] text-muted-foreground">{t(VERDICT_DESC_KEY[verdict])}</p>

      {/* Signals — portfolio basis, plus the new-project deltas when projected. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
        <span>{t("financeTab.signalMargin")}: <span className="text-foreground">{formatPct(projected ? fit!.newPortfolioMarginPct : standing.signals.portfolioMarginPct, 1)}</span></span>
        <span>{t("financeTab.signalAtRisk")}: <span className="text-foreground">{standing.signals.atRiskCount}</span></span>
        <span>{t("financeTab.signalBacklog")}: <span className="text-foreground">{money(standing.signals.backlogCents)}</span></span>
        <span>{t("financeTab.signalProgress")}: <span className="text-foreground">{formatPct(standing.signals.overallProgressPct, 0)}</span></span>
        {projected && (
          <>
            <span>{t("financeTab.calcAddedBacklog")}: <span className="text-foreground">{money(fit!.addedBacklogCents)}</span></span>
            <span>
              {t("financeTab.calcOverlap")}: <span className="text-foreground">{fit!.overlappingActiveCount}</span>
              {!fit!.overlapFromDates && <span> ({t("financeTab.calcOverlapNoDates")})</span>}
            </span>
          </>
        )}
      </div>

      {/* Inputs — supply a potential project to refine the verdict with load and risk. */}
      <div className="space-y-2 border-t border-border/60 pt-3">
        <p className="text-[13px] text-muted-foreground">{t("financeTab.provideNewProjectHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="decision-contract" className="text-[13px] text-muted-foreground">{t("financeTab.calcContract")}</Label>
            <Input id="decision-contract" inputMode="decimal" value={contract} onChange={(e) => setContract(e.target.value)} placeholder="0" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decision-margin" className="text-[13px] text-muted-foreground">{t("financeTab.calcMarginPct")}</Label>
            <Input id="decision-margin" inputMode="decimal" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} placeholder="0" className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decision-start" className="text-[13px] text-muted-foreground">{t("financeTab.calcStart")}</Label>
            <Input id="decision-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="decision-duration" className="text-[13px] text-muted-foreground">{t("financeTab.calcDuration")}</Label>
            <Input id="decision-duration" inputMode="numeric" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} placeholder="0" className="h-8" />
          </div>
        </div>
        {projected && (
          <Badge variant="secondary" className="text-[13px]">{t("financeTab.calcNewMargin")}: {formatPct(fit!.newPortfolioMarginPct, 1)} · {money(fit!.newPortfolioMarginCents)}</Badge>
        )}
      </div>

      <p className="text-[13px] text-muted-foreground">{t("financeTab.verdictHeuristicNote")}</p>
    </div>
  );
}
