// A published client report on screen, with its PDF, previous reports and
// photo viewer. Shared by the public page /share/report/:token (ShareReport)
// and the report inside the project for a participant (ProjectReport, rovno#237).
// The caller owns the query; this component only reads it.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { QueryObserverResult } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { downloadNodeAsPdf } from "@/lib/download-pdf";
import { useDocumentHead } from "@/lib/blog/seo";
import { formatReportDay, formatReportPeriod } from "@/lib/client-report-format";
import type { SharedReport } from "@/data/client-report-source";
import {
  CLIENT_REPORT_SECTION_TITLE_CLASS,
  ClientReportView,
  type ClientReportViewData,
  type ClientReportViewPhoto,
} from "@/components/client-report/ClientReportView";
import { countCanvasReadablePhotos } from "@/components/client-report/report-photos";

export const REPORT_PARAM = "report";
// A4 at 96 CSS pixels per inch.
const PDF_RENDER_WIDTH_PX = 794;

// An unparseable expiry counts as expired, the same rule as ShareDocument.
function isExpired(expiresAt: string): boolean {
  const time = Date.parse(expiresAt);
  return !Number.isFinite(time) || time <= Date.now();
}

function toViewData(shared: SharedReport): ClientReportViewData {
  const { report } = shared;
  return {
    projectTitle: report.body.project_title,
    preparedBy: report.body.prepared_by,
    periodStart: report.period_start,
    periodEnd: report.period_end,
    publishedAt: report.published_at,
    note: report.note,
    done: report.body.done,
    photos: shared.photos.map((photo) => ({ id: photo.id, caption: photo.caption, url: photo.signedUrl })),
    inProgress: report.body.in_progress,
    next: report.body.next,
    progress: report.body.progress,
    stages: report.body.stages,
  };
}

const PAGE_PADDING = "p-sp-2 sm:p-sp-3";

function withHeader(header: ReactNode, content: ReactNode, padded: boolean) {
  if (!header) return content;
  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col gap-2", padded && PAGE_PADDING)}>
      {header}
      {content}
    </div>
  );
}

export interface ClientReportReaderQuery {
  readonly data: SharedReport | null | undefined;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly refetch: () => Promise<QueryObserverResult<SharedReport | null>>;
}

interface ClientReportReaderProps {
  readonly query: ClientReportReaderQuery;
  /** True when there is nothing to ask for (no token, no project). */
  readonly invalid?: boolean;
  /** The explanation under «Отчёт не найден». */
  readonly notFoundBody: ReactNode;
  /** Shown above the report and above the loading, not-found and error states. */
  readonly header?: ReactNode;
  /** False inside a layout that already pads the page (the project). */
  readonly padded?: boolean;
}

export function ClientReportReader({ query, invalid = false, notFoundBody, header, padded = true }: ClientReportReaderProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [openPhoto, setOpenPhoto] = useState<ClientReportViewPhoto | null>(null);
  const [refreshingForPdf, setRefreshingForPdf] = useState(false);
  // The report the file is drawn from, mounted off screen while it is drawn.
  const [pdfJob, setPdfJob] = useState<{ source: SharedReport } | null>(null);
  const pdfSource = pdfJob?.source ?? null;
  const pdfRef = useRef<HTMLDivElement>(null);
  const pdfStartedFor = useRef<object | null>(null);

  const shared = query.data ?? null;

  // A public page, but not one search engines should list: the link is the
  // credential, and the title is customer data.
  useDocumentHead({
    title: shared
      ? `${shared.report.body.project_title} | ${t("clientReport.page.headTitle")}`
      : t("clientReport.page.headTitle"),
    robots: "noindex, nofollow",
  });

  const viewData = useMemo(() => (shared ? toViewData(shared) : null), [shared]);
  const pdfData = useMemo(() => (pdfSource ? toViewData(pdfSource) : null), [pdfSource]);

  async function handleDownloadPdf() {
    if (!shared || refreshingForPdf || pdfJob) return;
    if (!isExpired(shared.expiresAt)) {
      setPdfJob({ source: shared });
      return;
    }
    // The photo URLs are short-lived; a page left open asks for fresh ones.
    // refetch() resolves with the PREVIOUS data when it fails, so the result
    // is checked before anything is drawn from it.
    setRefreshingForPdf(true);
    try {
      const result = await query.refetch();
      if (result.isError || !result.data || isExpired(result.data.expiresAt)) {
        toast({ title: t("clientReport.pdfFailedPublic"), variant: "destructive" });
        return;
      }
      setPdfJob({ source: result.data });
    } finally {
      setRefreshingForPdf(false);
    }
  }

  useEffect(() => {
    // The ref guard keeps a re-run of this effect from saving the file twice.
    if (!pdfJob || pdfStartedFor.current === pdfJob) return;
    pdfStartedFor.current = pdfJob;
    const pdfSource = pdfJob.source;
    const node = pdfRef.current;
    if (!node) {
      setPdfJob(null);
      return;
    }
    downloadNodeAsPdf(node, {
      fileName: t("clientReport.pdfFileName", {
        project: pdfSource.report.body.project_title,
        period: formatReportPeriod(pdfSource.report.period_start, pdfSource.report.period_end, language),
      }),
      renderWidthPx: PDF_RENDER_WIDTH_PX,
    })
      .then(() => {
        if (countCanvasReadablePhotos(node) < pdfSource.photos.length) {
          toast({ title: t("clientReport.pdfPhotosSkipped") });
        }
      })
      .catch(() => {
        toast({ title: t("clientReport.pdfFailedPublic"), variant: "destructive" });
      })
      .finally(() => setPdfJob(null));
  }, [pdfJob, language, t]);

  const savingPdf = refreshingForPdf || pdfJob !== null;

  if (invalid || (query.isSuccess && !shared)) {
    return withHeader(
      header,
      <div className="flex flex-col items-center px-sp-3 py-sp-6 text-center">
        <div className="mb-sp-2 rounded-panel bg-muted p-sp-2">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="mb-1 text-h3 text-foreground">{t("clientReport.page.notFoundTitle")}</h1>
        {notFoundBody}
      </div>,
      padded,
    );
  }

  if (query.isError && !shared) {
    return withHeader(
      header,
      <div className="p-sp-3">
        <EmptyState
          icon={AlertTriangle}
          title={t("clientReport.page.errorTitle")}
          description={t("share.document.errorBody")}
          actionLabel={t("share.document.retry")}
          onAction={() => { void query.refetch(); }}
        />
      </div>,
      padded,
    );
  }

  if (!shared || !viewData) {
    return withHeader(
      header,
      <div className={cn("mx-auto max-w-2xl space-y-sp-2", padded && "p-sp-3")} aria-busy="true">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>,
      padded,
    );
  }

  const latest = shared.reports[0];
  const showsLatest = !latest || latest.id === shared.report.id;
  const publishedAt = Date.parse(shared.report.published_at);
  const previousReports = shared.reports
    .filter((item) => item.id !== shared.report.id && Date.parse(item.published_at) < publishedAt)
    .map((item) => ({ ...item, label: formatReportPeriod(item.period_start, item.period_end, language) }));
  const labelCounts = new Map<string, number>();
  previousReports.forEach((item) => labelCounts.set(item.label, (labelCounts.get(item.label) ?? 0) + 1));

  return (
    <div className={cn("mx-auto flex max-w-2xl flex-col gap-2", padded && PAGE_PADDING)}>
      {header}
      {!showsLatest && (
        <Link to={{ search: "" }} className="self-start text-body-sm text-accent hover:underline">
          {t("clientReport.view.backToLatest")}
        </Link>
      )}
      <ClientReportView
        data={viewData}
        onOpenPhoto={setOpenPhoto}
        extras={(shared.pdfAllowed || previousReports.length > 0) ? (
          <>
            {shared.pdfAllowed && (
              <div>
                <Button variant="outline" onClick={() => { void handleDownloadPdf(); }} disabled={savingPdf}>
                  <Download className="mr-1.5 h-4 w-4" />
                  {t("clientReport.downloadPdf")}
                </Button>
              </div>
            )}
            {previousReports.length > 0 && (
              <section className="flex flex-col gap-1.5" aria-label={t("clientReport.view.previous")}>
                <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>{t("clientReport.view.previous")}</h2>
                <ul className="flex flex-col gap-1">
                  {previousReports.map((item) => (
                    <li key={item.id}>
                      <Link
                        to={{ search: `?${REPORT_PARAM}=${encodeURIComponent(item.id)}` }}
                        className="text-accent hover:underline"
                      >
                        {(labelCounts.get(item.label) ?? 0) > 1
                          ? `${item.label} · ${formatReportDay(item.published_at, language)}`
                          : item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : undefined}
      />

      {pdfData && createPortal(
        <div
          aria-hidden="true"
          {...{ inert: "" }}
          style={{ position: "fixed", left: -10000, top: 0, width: PDF_RENDER_WIDTH_PX, pointerEvents: "none" }}
        >
          <ClientReportView ref={pdfRef} data={pdfData} />
        </div>,
        document.body,
      )}

      <Dialog open={openPhoto !== null} onOpenChange={(open) => { if (!open) setOpenPhoto(null); }}>
        <DialogContent aria-describedby={undefined} className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">
            {openPhoto?.caption || t("clientReport.view.photo")}
          </DialogTitle>
          {openPhoto && (
            <img
              src={openPhoto.url}
              alt={openPhoto.caption ?? ""}
              className="mx-auto max-h-[85vh] w-auto max-w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
