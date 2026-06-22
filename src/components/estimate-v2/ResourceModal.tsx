import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import {
  useResourceArticleDetail,
  useResourceArticlePriceComparison,
} from "@/hooks/use-resource-article";
import type {
  EstimateV2ResourceLine,
  EstimateV2Version,
  ResourceLineType,
} from "@/types/estimate-v2";

interface ResourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  articleId: string | null;
  projectId: string;
  /** The clicked estimate line — local context (qty / cost / markup). */
  line: EstimateV2ResourceLine | null;
  /** All current estimate lines — for the estimate-wide quantity rollup. */
  lines: EstimateV2ResourceLine[];
  /** Version snapshots — for the price-over-versions sparkline. */
  versions: EstimateV2Version[];
  /**
   * Whether the viewer may see sensitive finance detail. Gates the cross-project price
   * comparison (median/avg/min/max), which aggregates other projects' unit prices and must
   * not leak to summary/none finance-visibility members.
   */
  canViewSensitiveDetail: boolean;
}

const RESOURCE_TYPES = new Set<ResourceLineType>([
  "material",
  "tool",
  "labor",
  "subcontractor",
  "overhead",
  "other",
]);

function asResourceType(value: string): ResourceLineType {
  return RESOURCE_TYPES.has(value as ResourceLineType) ? (value as ResourceLineType) : "other";
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `${Math.round(cents / 100).toLocaleString("ru-RU")} ₽`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 240;
  const h = 48;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p - min) / range);
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-12 w-full text-primary"
      preserveAspectRatio="none"
      role="img"
      aria-label="sparkline"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ResourceModalBody({ articleId, projectId, line, lines, versions, open, canViewSensitiveDetail }: Omit<ResourceModalProps, "onOpenChange">) {
  const { t } = useTranslation();
  const detailQuery = useResourceArticleDetail(open ? articleId : null);
  // Cross-project price comparison is sensitive finance detail: only fetch it for viewers
  // allowed to see it (the RPC is also gated server-side; this is defense in depth).
  const comparisonQuery = useResourceArticlePriceComparison(open ? articleId : null, projectId, {
    enabled: open && canViewSensitiveDetail,
  });

  const estimateQtyMilli = useMemo(
    () => lines.filter((l) => l.systemResourceArticleId === articleId).reduce((sum, l) => sum + l.qtyMilli, 0),
    [lines, articleId],
  );
  const estimateLineCount = useMemo(
    () => lines.filter((l) => l.systemResourceArticleId === articleId).length,
    [lines, articleId],
  );

  const historyPoints = useMemo(() => {
    const pts: number[] = [];
    const sorted = [...versions].sort((a, b) => a.number - b.number);
    for (const version of sorted) {
      const matching = version.snapshot.lines.filter(
        (l) => l.systemResourceArticleId === articleId && l.costUnitCents > 0,
      );
      if (matching.length === 0) continue;
      pts.push(Math.round(matching.reduce((sum, l) => sum + l.costUnitCents, 0) / matching.length));
    }
    if (line && line.costUnitCents > 0) pts.push(line.costUnitCents);
    return pts;
  }, [versions, articleId, line]);

  const detail = detailQuery.data;
  const article = detail?.article;
  const comparison = comparisonQuery.data;

  if (detailQuery.isLoading) {
    return <div className="px-1 py-8 text-center text-sm text-muted-foreground">{t("estimate.resourceModal.loading")}</div>;
  }
  if (!article) {
    return <div className="px-1 py-8 text-center text-sm text-muted-foreground">{t("estimate.resourceModal.notFound")}</div>;
  }

  const markupPct = line ? Math.round((line.markupBps ?? 0) / 100) : null;

  return (
    <Tabs defaultValue="description" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="description">{t("estimate.resourceModal.tabs.description")}</TabsTrigger>
        <TabsTrigger value="article">{t("estimate.resourceModal.tabs.article")}</TabsTrigger>
        <TabsTrigger value="context">{t("estimate.resourceModal.tabs.context")}</TabsTrigger>
        <TabsTrigger value="price">{t("estimate.resourceModal.tabs.priceHistory")}</TabsTrigger>
        <TabsTrigger value="suppliers" disabled title={t("estimate.resourceModal.soon")}>
          {t("estimate.resourceModal.tabs.suppliers")}
        </TabsTrigger>
        <TabsTrigger value="guides" disabled title={t("estimate.resourceModal.soon")}>
          {t("estimate.resourceModal.tabs.guides")}
        </TabsTrigger>
      </TabsList>

      <div className="min-h-0 flex-1 overflow-y-auto pt-3">
        <TabsContent value="description" className="mt-0 space-y-3">
          <div className="flex aspect-[16/7] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
            {t("estimate.resourceModal.photoPlaceholder")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ResourceTypeBadge type={asResourceType(article.defaultResourceType)} />
            {article.subcategory && <Badge variant="secondary">{article.subcategory}</Badge>}
            <Badge variant="outline" className="text-muted-foreground">{article.source}</Badge>
          </div>
          {article.canonicalName && article.canonicalName !== article.name && (
            <p className="text-xs text-muted-foreground">{article.name}</p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{article.categoryPath}</p>
        </TabsContent>

        <TabsContent value="article" className="mt-0">
          <dl className="divide-y divide-border">
            <Field label={t("estimate.resourceModal.fields.rovnoSku")} value={article.rovnoSku} />
            <Field label={t("estimate.resourceModal.fields.okpd2")} value={article.okpd2Code} />
            <Field label={t("estimate.resourceModal.fields.category")} value={article.categoryPath} />
            <Field
              label={t("estimate.resourceModal.fields.unit")}
              value={
                article.unitOriginal && article.unitOriginal !== article.unitDisplay
                  ? `${article.unitDisplay} (${article.unitOriginal})`
                  : article.unitDisplay
              }
            />
            <Field label={t("estimate.resourceModal.fields.type")} value={article.defaultResourceType} />
            <Field label={t("estimate.resourceModal.fields.source")} value={article.source} />
          </dl>
        </TabsContent>

        <TabsContent value="context" className="mt-0">
          <dl className="divide-y divide-border">
            <Field
              label={t("estimate.resourceModal.context.inLine")}
              value={
                line
                  ? `${(line.qtyMilli / 1000).toLocaleString("ru-RU")} ${line.unit} · ${formatCents(line.costUnitCents)}`
                  : "—"
              }
            />
            <Field
              label={t("estimate.resourceModal.context.inEstimate")}
              value={`${(estimateQtyMilli / 1000).toLocaleString("ru-RU")} · ${t("estimate.resourceModal.context.lineCount", { count: estimateLineCount })}`}
            />
          </dl>
        </TabsContent>

        <TabsContent value="price" className="mt-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-2.5">
              <p className="text-xs text-muted-foreground">{t("estimate.resourceModal.price.yourCost")}</p>
              <p className="text-base font-semibold">{formatCents(line?.costUnitCents)}</p>
            </div>
            <div className="rounded-md border border-border p-2.5">
              <p className="text-xs text-muted-foreground">{t("estimate.resourceModal.price.markup")}</p>
              <p className="text-base font-semibold">{markupPct == null ? "—" : `${markupPct}%`}</p>
            </div>
          </div>

          {historyPoints.length >= 2 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("estimate.resourceModal.price.sparklineTitle")}</p>
              <Sparkline points={historyPoints} />
            </div>
          )}

          {canViewSensitiveDetail && (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {t("estimate.resourceModal.tabs.priceHistory")}
              </p>
              {comparison && comparison.sampleCount > 0 ? (
                <dl className="divide-y divide-border">
                  <Field label={t("estimate.resourceModal.price.median")} value={formatCents(comparison.medianCents)} />
                  <Field label={t("estimate.resourceModal.price.average")} value={formatCents(comparison.avgCents)} />
                  <Field
                    label={t("estimate.resourceModal.price.range")}
                    value={`${formatCents(comparison.minCents)} – ${formatCents(comparison.maxCents)}`}
                  />
                  <Field
                    label={t("estimate.resourceModal.price.basis")}
                    value={t("estimate.resourceModal.price.basisValue", {
                      projects: comparison.projectCount,
                      samples: comparison.sampleCount,
                    })}
                  />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">{t("estimate.resourceModal.price.noComparison")}</p>
              )}
            </div>
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}

export function ResourceModal({ open, onOpenChange, articleId, projectId, line, lines, versions, canViewSensitiveDetail }: ResourceModalProps) {
  const { t } = useTranslation();
  const title = line?.title || t("estimate.resourceModal.title");

  // Responsive Dialog (full-width + tall on mobile, centered card on desktop).
  // Intentionally not vaul Drawer: vaul is unused elsewhere in the app and
  // resolves a duplicate React under vite (Invalid hook call) without a
  // resolve.dedupe config — a responsive Dialog gives the same mobile UX safely.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-2xl flex-col gap-3 p-4 sm:max-h-[85vh] sm:gap-4 sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">{t("estimate.resourceModal.title")}</DialogDescription>
        </DialogHeader>
        <ResourceModalBody
          open={open}
          articleId={articleId}
          projectId={projectId}
          line={line}
          lines={lines}
          versions={versions}
          canViewSensitiveDetail={canViewSensitiveDetail}
        />
      </DialogContent>
    </Dialog>
  );
}
