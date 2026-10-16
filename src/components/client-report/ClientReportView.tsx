// The report as the client sees it. One presentational component for the
// public page (/share/report/:token) and for the PDF built in the owner's
// window, so the two cannot drift apart.

import { forwardRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { formatReportDay, formatReportPeriod } from "@/lib/client-report-format";
import type {
  ClientReportDoneTask,
  ClientReportNextTask,
  ClientReportProgress,
  ClientReportStages,
  ClientReportTask,
} from "@/data/client-report-source";

export interface ClientReportViewPhoto {
  id: string;
  caption: string | null;
  url: string;
}

export interface ClientReportViewData {
  projectTitle: string;
  preparedBy: string | null;
  periodStart: string;
  periodEnd: string;
  /** Null for a report that is not published yet (the owner's preview). */
  publishedAt: string | null;
  note: string | null;
  done: ClientReportDoneTask[];
  photos: ClientReportViewPhoto[];
  inProgress: ClientReportTask[];
  next: ClientReportNextTask[];
  progress: ClientReportProgress | null;
  stages: ClientReportStages | null;
}

interface ClientReportViewProps {
  data: ClientReportViewData;
  /** Makes each photo a button; without it photos are plain images. */
  onOpenPhoto?: (photo: ClientReportViewPhoto) => void;
  /** Rendered between the report and its footer; kept out of the PDF. */
  extras?: ReactNode;
  className?: string;
}

export const CLIENT_REPORT_SECTION_TITLE_CLASS = "text-[11px] font-semibold uppercase tracking-[0.07em] text-[hsl(66_8%_40%)]";
const ROW_DATE_CLASS = "ml-auto whitespace-nowrap text-xs tabular-nums text-[hsl(66_8%_40%)]";

function ReportPhoto({
  photo,
  onOpen,
  openLabel,
}: {
  photo: ClientReportViewPhoto;
  onOpen?: (photo: ClientReportViewPhoto) => void;
  openLabel: string;
}) {
  // Requested with CORS first; on an error, once more without it.
  const [mode, setMode] = useState<"cors" | "plain" | "broken">("cors");
  if (mode === "broken") return null;

  const image = (
    <>
      <img
        src={photo.url}
        alt={photo.caption ?? ""}
        crossOrigin={mode === "cors" ? "anonymous" : undefined}
        onError={() => setMode((current) => (current === "cors" ? "plain" : "broken"))}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {photo.caption && (
        <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1.5 py-1 text-left text-[10px] leading-tight text-white">
          {photo.caption}
        </span>
      )}
    </>
  );

  const frameClass = "relative block aspect-[4/3] w-full overflow-hidden rounded-lg bg-[hsl(66_12%_88%)]";
  if (!onOpen) {
    return <div className={frameClass} data-pdf-keep data-report-photo={mode}>{image}</div>;
  }
  return (
    <button
      type="button"
      className={cn(frameClass, "cursor-zoom-in")}
      onClick={() => onOpen(photo)}
      aria-label={openLabel}
      data-pdf-keep
      data-report-photo={mode}
    >
      {image}
    </button>
  );
}

export const ClientReportView = forwardRef<HTMLDivElement, ClientReportViewProps>(
  function ClientReportView({ data, onOpenPhoto, extras, className }, ref) {
    const { t, i18n } = useTranslation();
    const language = i18n.language;
    const period = formatReportPeriod(data.periodStart, data.periodEnd, language);
    const preparedBy = data.preparedBy?.trim() ?? "";
    const note = data.note?.trim() ?? "";
    const showDone = data.done.length > 0 || data.photos.length > 0;
    const stages = data.stages && data.stages.total > 1 ? data.stages : null;

    return (
      <div
        ref={ref}
        className={cn(
          "flex min-w-0 flex-col gap-4 rounded-2xl border border-[hsl(55_20%_80%)] bg-white p-4 text-[13px] leading-normal text-[hsl(52_40%_8%)] sm:p-6",
          className,
        )}
      >
        <img src="/logo.svg" alt={t("nav.appName")} className="h-6 w-auto self-start" />

        <div>
          <h1 className="text-xl font-bold leading-tight break-words">{data.projectTitle}</h1>
          <p className="mt-1 text-xs text-[hsl(66_8%_40%)]">
            {preparedBy
              ? t("clientReport.view.meta", { period, name: preparedBy })
              : t("clientReport.view.metaNoAuthor", { period })}
          </p>
        </div>

        {note && (
          <div className="rounded-xl rounded-bl bg-[hsl(55_38%_94%)] px-3 py-2.5 leading-snug" data-pdf-keep>
            {preparedBy && <b className="mb-0.5 block text-[11.5px]">{preparedBy}</b>}
            <p className="whitespace-pre-wrap break-words">{note}</p>
          </div>
        )}

        {showDone && (
          <section className="flex flex-col gap-1.5" aria-label={t("clientReport.block.done")}>
            <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>{t("clientReport.block.done")}</h2>
            {data.done.length > 0 && (
              <ul className="flex flex-col gap-1">
                {data.done.map((task) => (
                  <li key={task.id} className="flex items-baseline gap-2">
                    <span className="font-bold text-success" aria-hidden="true">✓</span>
                    <span className="min-w-0 break-words">{task.title}</span>
                    <span className={ROW_DATE_CLASS}>{formatReportDay(task.completed_at, language)}</span>
                  </li>
                ))}
              </ul>
            )}
            {data.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {data.photos.map((photo) => (
                  <ReportPhoto
                    // A new URL for the same photo starts from a clean load state.
                    key={`${photo.id}:${photo.url}`}
                    photo={photo}
                    onOpen={onOpenPhoto}
                    openLabel={t("clientReport.view.openPhoto", { caption: photo.caption ?? "" })}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {data.inProgress.length > 0 && (
          <section className="flex flex-col gap-1.5" aria-label={t("clientReport.block.inProgress")}>
            <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>{t("clientReport.block.inProgress")}</h2>
            <ul className="flex flex-col gap-1">
              {data.inProgress.map((task) => (
                <li key={task.id} className="flex items-baseline gap-2">
                  <span className="text-[11px]" aria-hidden="true">⏳</span>
                  <span className="min-w-0 break-words">{task.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.next.length > 0 && (
          <section className="flex flex-col gap-1.5" aria-label={t("clientReport.block.next")}>
            <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>{t("clientReport.block.next")}</h2>
            <ul className="flex flex-col gap-1">
              {data.next.map((task) => (
                <li key={task.id} className="flex items-baseline gap-2">
                  <span className="min-w-0 break-words">{task.title}</span>
                  <span className={ROW_DATE_CLASS}>{formatReportDay(task.due_at, language)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.progress && (
          <section className="flex flex-col gap-1.5" data-pdf-keep>
            <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>{t("clientReport.view.progress", { pct: data.progress.pct })}</h2>
            <div className="h-2 overflow-hidden rounded-full bg-[hsl(66_12%_88%)]">
              <div
                className="h-full bg-success"
                style={{ width: `${Math.max(0, Math.min(100, data.progress.pct))}%` }}
              />
            </div>
            <span className="text-xs text-[hsl(66_8%_40%)]">
              {t("clientReport.view.progressCount", { done: data.progress.done, total: data.progress.total })}
            </span>
          </section>
        )}

        {stages && (
          <section className="flex flex-col gap-1.5">
            <h2 className={CLIENT_REPORT_SECTION_TITLE_CLASS}>
              {t("clientReport.view.stages", { completed: stages.completed, total: stages.total })}
            </h2>
            <ul className="flex flex-col gap-1">
              {stages.items.map((stage, index) => (
                <li key={`${index}-${stage.title}`} className="flex items-baseline gap-2">
                  {stage.state === "completed" && (
                    <span className="font-bold text-success" aria-hidden="true">✓</span>
                  )}
                  {stage.state === "in_progress" && <span className="text-[11px]" aria-hidden="true">⏳</span>}
                  <span className="min-w-0 break-words">{stage.title}</span>
                  {stage.state === "completed" && (
                    <span className={ROW_DATE_CLASS}>{t("clientReport.view.stageDone")}</span>
                  )}
                  {stage.state === "in_progress" && (
                    <span className={ROW_DATE_CLASS}>{t("clientReport.block.inProgress")}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {extras && <div className="flex flex-col gap-4" data-pdf-exclude>{extras}</div>}

        <footer className="flex flex-wrap justify-between gap-2 border-t border-[hsl(55_20%_86%)] pt-2 text-[11px] text-[hsl(66_8%_40%)]">
          <a href="https://rovno.ai" target="_blank" rel="noopener noreferrer" className="hover:underline">
            {t("clientReport.view.madeIn")}
          </a>
          {data.publishedAt && (
            <span>{t("clientReport.view.publishedAt", { date: formatReportDay(data.publishedAt, language) })}</span>
          )}
        </footer>
      </div>
    );
  },
);
