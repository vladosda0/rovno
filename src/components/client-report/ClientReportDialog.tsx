// "Отчёт клиенту": the owner sees the report the way the client will, strikes
// out what should not go, adds a few words and publishes it to the project's
// public link. Everything shown is assembled by preview_client_report; nothing
// in the project changes when a line is removed here.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Copy, Download, Link2Off } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MediaImage } from "@/components/MediaImage";
import { toast } from "@/hooks/use-toast";
import { useMedia } from "@/hooks/use-mock-data";
import { cn } from "@/lib/utils";
import { downloadNodeAsPdf } from "@/lib/download-pdf";
import {
  ClientReportView,
  type ClientReportViewData,
} from "@/components/client-report/ClientReportView";
import { countCanvasReadablePhotos } from "@/components/client-report/report-photos";
import {
  formatReportDay,
  formatReportPeriod,
  isUsableReportDate,
  resolveCustomReportPeriod,
  toDateInputValue,
} from "@/lib/client-report-format";
import {
  buildClientReportShareLink,
  clientReportErrorCode,
  createProjectMediaSignedUrl,
  clientReportLimitNextPublishAt,
  previewClientReport,
  publishClientReport,
  revokeClientReportLink,
  setClientReportSettings,
  type ClientReportHideKey,
  type ClientReportPreview,
  type ClientReportQuota,
  type ClientReportRhythm,
} from "@/data/client-report-source";
import type { Media } from "@/types/entities";

const NOTE_MAX_LENGTH = 600;
// A4 at 96 CSS pixels per inch.
const PDF_RENDER_WIDTH_PX = 794;

interface ReportRange {
  from: string | null;
  to: string | null;
}

const DEFAULT_RANGE: ReportRange = { from: null, to: null };
const NO_DRAFT: { from: string | null; to: string | null } = { from: null, to: null };

/** The client view without photo URLs, which are signed only when a file is drawn. */
interface ReportSnapshot {
  data: Omit<ClientReportViewData, "photos">;
  photos: Array<{ id: string; caption: string | null }>;
}

function sameRange(a: ReportRange, b: ReportRange): boolean {
  return a.from === b.from && a.to === b.to;
}
const RHYTHMS: ClientReportRhythm[] = ["weekly", "monthly"];
const BLOCK_CLASS = "flex flex-col gap-1.5 border-t border-border pt-2";
const BLOCK_TITLE_CLASS = "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";
const HINT_CLASS = "text-caption text-muted-foreground";

interface ClientReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function ReportLine({
  label,
  title,
  excluded,
  onToggle,
}: {
  label: string;
  title: string;
  excluded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("min-w-0 break-words", excluded && "text-muted-foreground line-through")}>{label}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={t(excluded ? "clientReport.restore" : "clientReport.exclude", { title })}
        className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground"
      >
        {excluded ? "↺" : "×"}
      </button>
    </div>
  );
}

function ReportPhotoTile({
  caption,
  name,
  media,
  excluded,
  onToggle,
}: {
  caption: string;
  /** Accessible name of the tile's button; differs between photos without a caption. */
  name: string;
  media: Media | undefined;
  excluded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden rounded-lg bg-muted", excluded && "opacity-35")}>
      <MediaImage
        storage={media?.storage}
        alt={caption}
        imgClassName="absolute inset-0 h-full w-full object-cover"
        fallback={(
          <span className="absolute inset-0 grid place-items-center">
            <Camera className="h-5 w-5 text-muted-foreground" />
          </span>
        )}
      />
      {caption && (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 bg-black/45 px-1.5 py-1 text-[10px] leading-tight text-white",
            excluded && "line-through",
          )}
        >
          {caption}
        </span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label={t(excluded ? "clientReport.restore" : "clientReport.exclude", { title: name })}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-md bg-black/45 text-[11px] text-white"
      >
        {excluded ? "↺" : "×"}
      </button>
    </div>
  );
}

export function ClientReportDialog({ open, onOpenChange, projectId }: ClientReportDialogProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const media = useMedia(projectId);
  const queryClient = useQueryClient();

  const [range, setRange] = useState<ReportRange>(DEFAULT_RANGE);
  // What is typed into the date inputs and not committed yet.
  const [draft, setDraft] = useState(NO_DRAFT);
  // The last preview that loaded, with the range it was asked for. The editor
  // is drawn from this, so a failed request for another range leaves it intact.
  const [good, setGood] = useState<{ preview: ClientReportPreview; range: ReportRange } | null>(null);
  const [note, setNote] = useState("");
  const [excludedTasks, setExcludedTasks] = useState<Set<string>>(new Set());
  const [excludedPhotos, setExcludedPhotos] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<ClientReportHideKey>>(new Set());
  const [quotaOverride, setQuotaOverride] = useState<ClientReportQuota | null>(null);
  const [periodInvalid, setPeriodInvalid] = useState(false);
  // undefined: follow the preview; null: revoked in this window.
  const [linkToken, setLinkToken] = useState<string | null | undefined>(undefined);
  // The report as it was published from this window; its PDF is drawn from here.
  const [published, setPublished] = useState<ReportSnapshot | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);
  // The client view mounted off screen only while a PDF is drawn.
  const [pdfJob, setPdfJob] = useState<{ data: ClientReportViewData; expectedPhotos: number } | null>(null);
  const [preparingPdf, setPreparingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);
  const pdfStartedFor = useRef<object | null>(null);
  const lastPreviewData = useRef<object | null>(null);
  const handledErrorAt = useRef(0);
  // Counts quota overrides. Each preview carries the count at the moment it
  // was requested; the override is dropped only by a preview whose count
  // equals the current one.
  const overrideSeq = useRef(0);

  function overrideQuota(next: ClientReportQuota) {
    overrideSeq.current += 1;
    setQuotaOverride(next);
  }

  const previewQuery = useQuery({
    queryKey: ["client-report-preview", projectId, range.from, range.to],
    queryFn: async () => {
      const requestedAtSeq = overrideSeq.current;
      return { preview: await previewClientReport(projectId, range), requestedAtSeq };
    },
    enabled: open && Boolean(projectId),
    staleTime: 0,
    gcTime: 0,
    retry: (failureCount, error) => clientReportErrorCode(error) === null && failureCount < 1,
  });

  useEffect(() => {
    const data = previewQuery.data;
    if (!data || lastPreviewData.current === data) return;
    lastPreviewData.current = data;
    setGood({ preview: data.preview, range });
    if (data.requestedAtSeq === overrideSeq.current) setQuotaOverride(null);
    setLinkToken(undefined);
  }, [previewQuery.data, range]);

  useEffect(() => {
    if (!previewQuery.isError || handledErrorAt.current === previewQuery.errorUpdatedAt) return;
    handledErrorAt.current = previewQuery.errorUpdatedAt;
    if (!good) return;
    if (clientReportErrorCode(previewQuery.error) === "client_report_bad_period") {
      setRange(DEFAULT_RANGE);
      toast({ title: t("clientReport.badPeriod"), variant: "destructive" });
    } else {
      setRange(good.range);
      toast({ title: t("clientReport.dialog.loadFailed"), variant: "destructive" });
    }
  }, [previewQuery.isError, previewQuery.errorUpdatedAt, previewQuery.error, good, t]);

  const preview = good?.preview ?? null;
  // The lists on screen belong to another range, or are being re-read.
  const refreshing = Boolean(good) && (
    previewQuery.isFetching
    || (previewQuery.data != null && previewQuery.data.preview !== preview)
    || !sameRange(range, good!.range)
  );
  const periodBlocked = periodInvalid && (draft.from !== null || draft.to !== null);
  const quota = quotaOverride ?? preview?.quota ?? null;
  const shareToken = linkToken === undefined ? preview?.link?.share_token ?? null : linkToken;
  const shareLink = shareToken ? buildClientReportShareLink(shareToken) : null;
  const mediaById = useMemo(() => new Map(media.map((item) => [item.id, item])), [media]);
  const publishedAt = published?.data.publishedAt ?? null;

  const body = preview?.body ?? null;
  const stages = body?.stages && body.stages.total > 1 ? body.stages : null;
  const visibleCount = body
    ? body.done.filter((task) => !excludedTasks.has(task.id)).length
      + body.photos.filter((photo) => !excludedPhotos.has(photo.id)).length
      + body.in_progress.filter((task) => !excludedTasks.has(task.id)).length
      + body.next.filter((task) => !excludedTasks.has(task.id)).length
    : 0;
  const nothingToShow = visibleCount === 0 && note.trim() === "";

  const toggleTask = (id: string) => setExcludedTasks((current) => toggled(current, id));
  const togglePhoto = (id: string) => setExcludedPhotos((current) => toggled(current, id));
  const toggleHidden = (key: ClientReportHideKey) => setHidden((current) => toggled(current, key));

  const refreshPreview = () =>
    queryClient.invalidateQueries({ queryKey: ["client-report-preview", projectId] });

  async function saveSettings(rhythm: ClientReportRhythm, reminderEnabled: boolean) {
    if (savingSettings) return;
    setSavingSettings(true);
    try {
      overrideQuota(await setClientReportSettings(projectId, rhythm, reminderEnabled));
    } catch {
      toast({ title: t("clientReport.settings.saveFailed"), variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  const today = toDateInputValue(new Date().toISOString());
  const committedFrom = preview ? toDateInputValue(range.from ?? preview.period_start) : "";
  const committedTo = preview ? toDateInputValue(range.to ?? preview.period_end) : "";

  // Called on blur and on Enter, never per keystroke. Two usable dates that
  // do not make a period yet stay in the inputs, so the other edge can be
  // typed next; anything else puts the committed dates back.
  function commitPeriod() {
    if (!preview || (draft.from === null && draft.to === null)) return;
    const from = draft.from ?? committedFrom;
    const to = draft.to ?? committedTo;
    const next = resolveCustomReportPeriod(from, to);
    setPeriodInvalid(!next);
    if (!next && isUsableReportDate(from) && isUsableReportDate(to)) return;
    setDraft(NO_DRAFT);
    if (next && !sameRange(next, range)) setRange(next);
  }

  function changeDraft(edge: "from" | "to", value: string) {
    if (draft.from === null && draft.to === null) setPeriodInvalid(false);
    setDraft((current) => ({ ...current, [edge]: value }));
  }

  function snapshot(at: string | null): ReportSnapshot | null {
    if (!preview || !body) return null;
    return {
      data: {
        projectTitle: preview.project_title,
        preparedBy: preview.prepared_by,
        periodStart: preview.period_start,
        periodEnd: preview.period_end,
        publishedAt: at,
        note: note.trim(),
        done: body.done.filter((task) => !excludedTasks.has(task.id)),
        inProgress: body.in_progress.filter((task) => !excludedTasks.has(task.id)),
        next: body.next.filter((task) => !excludedTasks.has(task.id)),
        progress: hidden.has("progress") ? null : body.progress,
        stages: hidden.has("stages") ? null : body.stages,
      },
      photos: body.photos
        .filter((photo) => !excludedPhotos.has(photo.id))
        .map((photo) => ({ id: photo.id, caption: photo.caption })),
    };
  }

  async function handlePublish() {
    if (!good || !body || !quota || publishing || refreshing || periodBlocked) return;
    setPublishing(true);
    try {
      const taskIds = new Set([...body.done, ...body.in_progress, ...body.next].map((task) => task.id));
      const photoIds = new Set(body.photos.map((photo) => photo.id));
      const result = await publishClientReport(projectId, {
        note: note.trim(),
        excludedTaskIds: [...excludedTasks].filter((id) => taskIds.has(id)),
        excludedMediaIds: [...excludedPhotos].filter((id) => photoIds.has(id)),
        hide: [...hidden],
        // The range of the lists on screen, not whatever the inputs hold.
        from: good.range.from,
        to: good.range.to,
      });
      setPublished(snapshot(result.published_at));
      setDraft(NO_DRAFT);
      setPeriodInvalid(false);
      overrideQuota(result.quota);
      setLinkToken(result.share_token);
      setNote("");
      setExcludedTasks(new Set());
      setExcludedPhotos(new Set());
      setHidden(new Set());
      setRange(DEFAULT_RANGE);
      void refreshPreview();
    } catch (error) {
      const code = clientReportErrorCode(error);
      if (code === "client_report_limit") {
        // The window was opened before someone else published: show the date
        // instead of a toast, the same way a fresh open would.
        overrideQuota({
          ...quota,
          can_publish: false,
          next_publish_at: clientReportLimitNextPublishAt(error) ?? quota.next_publish_at,
        });
      } else if (code === "client_report_bad_period") {
        setRange(DEFAULT_RANGE);
        toast({ title: t("clientReport.badPeriod"), variant: "destructive" });
      } else if (code === "client_report_empty") {
        toast({ title: t("clientReport.publishEmpty"), variant: "destructive" });
      } else if (code === "client_report_note_too_long") {
        toast({ title: t("clientReport.noteTooLong"), variant: "destructive" });
      } else {
        toast({ title: t("clientReport.publishFailed"), variant: "destructive" });
      }
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopy() {
    if (!shareLink) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(shareLink);
      toast({ title: t("documents.share.copied"), description: t("clientReport.linkHint") });
    } catch {
      toast({ title: t("documents.share.copyFailed"), description: shareLink, variant: "destructive" });
    }
  }

  async function handleRevoke() {
    setRevokeConfirmOpen(false);
    if (revoking) return;
    setRevoking(true);
    try {
      await revokeClientReportLink(projectId);
      setLinkToken(null);
      setPublished(null);
      toast({ title: t("documents.share.revoked") });
      void refreshPreview();
    } catch {
      toast({ title: t("documents.share.revokeFailed"), variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  }

  const pdfBusy = preparingPdf || pdfJob !== null;

  async function handleDownloadPdf() {
    if (!quota?.pdf_allowed || pdfBusy) return;
    const source = published ?? (refreshing || periodBlocked ? null : snapshot(null));
    if (!source) return;
    setPreparingPdf(true);
    try {
      const urls = await Promise.all(
        source.photos.map((photo) => {
          const storage = mediaById.get(photo.id)?.storage;
          return storage ? createProjectMediaSignedUrl(storage.bucket, storage.objectPath) : Promise.resolve(null);
        }),
      );
      setPdfJob({
        data: {
          ...source.data,
          photos: source.photos.flatMap((photo, index) => {
            const url = urls[index];
            return url ? [{ ...photo, url }] : [];
          }),
        },
        expectedPhotos: source.photos.length,
      });
    } catch {
      toast({ title: t("clientReport.pdfFailed"), variant: "destructive" });
    } finally {
      setPreparingPdf(false);
    }
  }

  useEffect(() => {
    // The ref guard keeps a re-run of this effect from saving the file twice.
    if (!pdfJob || pdfStartedFor.current === pdfJob) return;
    pdfStartedFor.current = pdfJob;
    const node = pdfRef.current;
    if (!node) {
      setPdfJob(null);
      return;
    }
    downloadNodeAsPdf(node, {
      fileName: t("clientReport.pdfFileName", {
        project: pdfJob.data.projectTitle,
        period: formatReportPeriod(pdfJob.data.periodStart, pdfJob.data.periodEnd, language),
      }),
      renderWidthPx: PDF_RENDER_WIDTH_PX,
    })
      .then(() => {
        if (countCanvasReadablePhotos(node) < pdfJob.expectedPhotos) {
          toast({ title: t("clientReport.pdfPhotosSkipped") });
        }
      })
      .catch(() => {
        toast({ title: t("clientReport.pdfFailed"), variant: "destructive" });
      })
      .finally(() => setPdfJob(null));
  }, [pdfJob, language, t]);

  const pdfButton = quota && (
    <Button
      variant="outline"
      disabled={!quota.pdf_allowed || pdfBusy || (!published && (refreshing || periodBlocked))}
      onClick={() => { void handleDownloadPdf(); }}
    >
      <Download className="mr-1.5 h-4 w-4" />
      {t("clientReport.downloadPdf")}
    </Button>
  );
  const pdfLockedHint = quota && !quota.pdf_allowed && (
    <p className={HINT_CLASS}>{t("clientReport.pdfLockedHint")}</p>
  );

  const limitDate = quota ? formatReportDay(quota.next_publish_at, language) : "";
  const limitText = !quota || quota.can_publish || !limitDate
    ? null
    : quota.plan_code === "free"
      ? t("clientReport.limit.free", { date: limitDate })
      : quota.plan_code === "master"
        ? t("clientReport.limit.master", { date: limitDate })
        : t("clientReport.limit.next", { date: limitDate });

  const linkSection = shareLink && (
    <div className="flex flex-col gap-2">
      {publishedAt && (
        <p className={HINT_CLASS}>
          {t("clientReport.published", { date: formatReportDay(publishedAt, language) })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          value={shareLink}
          readOnly
          aria-label={t("documents.share.linkLabel")}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-caption"
        />
        <Button onClick={() => { void handleCopy(); }}>
          <Copy className="mr-1.5 h-4 w-4" />
          {t("documents.share.copyLink")}
        </Button>
      </div>
      <p className={HINT_CLASS}>{t("clientReport.linkHint")}</p>
      <div className="flex flex-wrap gap-2">
        {publishedAt && pdfButton}
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setRevokeConfirmOpen(true)}
          disabled={revoking}
        >
          <Link2Off className="mr-1.5 h-4 w-4" />
          {t("documents.share.revoke")}
        </Button>
      </div>
      {publishedAt && pdfLockedHint}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-modal border border-border bg-card text-body-sm shadow-xl">
          <DialogHeader>
            <DialogTitle>
              {preview ? t("clientReport.dialog.title", { project: preview.project_title }) : t("clientReport.action")}
            </DialogTitle>
            <DialogDescription>{t("clientReport.dialog.subtitle")}</DialogDescription>
          </DialogHeader>

          {previewQuery.isError && !preview && (
            <div className="flex flex-col items-start gap-2">
              <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-caption text-destructive">
                {t("clientReport.dialog.loadFailed")}
              </p>
              <Button variant="outline" onClick={() => { void previewQuery.refetch(); }}>
                {t("common.retry")}
              </Button>
            </div>
          )}

          {!preview && !previewQuery.isError && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {preview && body && quota && publishedAt && linkSection}

          {preview && body && quota && !publishedAt && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{t("clientReport.period.label")}</span>
                {quota.custom_period_allowed ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Input
                      type="date"
                      aria-label={t("clientReport.period.from")}
                      className="h-8 w-auto text-caption"
                      value={draft.from ?? committedFrom}
                      max={today}
                      onChange={(event) => changeDraft("from", event.target.value)}
                      onBlur={commitPeriod}
                      onKeyDown={(event) => { if (event.key === "Enter") commitPeriod(); }}
                    />
                    <span aria-hidden="true">–</span>
                    <Input
                      type="date"
                      aria-label={t("clientReport.period.to")}
                      className="h-8 w-auto text-caption"
                      value={draft.to ?? committedTo}
                      max={today}
                      onChange={(event) => changeDraft("to", event.target.value)}
                      onBlur={commitPeriod}
                      onKeyDown={(event) => { if (event.key === "Enter") commitPeriod(); }}
                    />
                  </span>
                ) : (
                  <span className="rounded-lg border border-border bg-background/50 px-2 py-0.5 text-caption">
                    {formatReportPeriod(preview.period_start, preview.period_end, language)}
                  </span>
                )}
              </div>
              {periodInvalid && <p className={HINT_CLASS} role="alert">{t("clientReport.period.invalid")}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span id="client-report-rhythm-label">{t("clientReport.rhythm.label")}</span>
                <span
                  role="radiogroup"
                  aria-labelledby="client-report-rhythm-label"
                  className={cn("inline-flex rounded-[9px] bg-muted/60 p-0.5 text-caption", quota.rhythm_locked && "opacity-55")}
                >
                  {RHYTHMS.map((rhythm) => (
                    <button
                      key={rhythm}
                      type="button"
                      role="radio"
                      aria-checked={quota.rhythm === rhythm}
                      disabled={quota.rhythm_locked || savingSettings || refreshing}
                      onClick={() => {
                        if (quota.rhythm !== rhythm) void saveSettings(rhythm, quota.reminder_enabled);
                      }}
                      className={cn(
                        "rounded-[7px] px-2.5 py-0.5 text-muted-foreground",
                        quota.rhythm === rhythm && "bg-card font-semibold text-foreground",
                      )}
                    >
                      {t(`clientReport.rhythm.${rhythm}`)}
                    </button>
                  ))}
                </span>
              </div>
              {quota.rhythm_locked && <p className={HINT_CLASS}>{t("clientReport.rhythm.lockedHint")}</p>}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="client-report-reminder">{t("clientReport.reminder.label")}</label>
                <Switch
                  id="client-report-reminder"
                  checked={quota.reminder_enabled}
                  disabled={savingSettings || refreshing}
                  onCheckedChange={(checked) => { void saveSettings(quota.rhythm, checked); }}
                />
              </div>

              <div className={BLOCK_CLASS}>
                <label htmlFor="client-report-note" className={BLOCK_TITLE_CLASS}>
                  {t("clientReport.note.label")}
                </label>
                <Textarea
                  id="client-report-note"
                  value={note}
                  maxLength={NOTE_MAX_LENGTH}
                  rows={3}
                  onChange={(event) => setNote(event.target.value.slice(0, NOTE_MAX_LENGTH))}
                />
              </div>

              <div
                className={cn("flex flex-col gap-3", refreshing && "opacity-50")}
                aria-busy={refreshing}
                data-testid="client-report-lists"
              >
                <div className={BLOCK_CLASS}>
                  <span className={BLOCK_TITLE_CLASS}>{t("clientReport.block.done")}</span>
                  {body.done.length === 0 && body.photos.length === 0 && (
                    <p className={HINT_CLASS}>
                      {t("clientReport.block.doneEmpty", { date: formatReportDay(preview.period_start, language) })}
                    </p>
                  )}
                  {body.done.map((task) => (
                    <ReportLine
                      key={task.id}
                      label={`✓ ${task.title}`}
                      title={task.title}
                      excluded={excludedTasks.has(task.id)}
                      onToggle={() => toggleTask(task.id)}
                    />
                  ))}
                  {body.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {body.photos.map((photo, index) => (
                        <ReportPhotoTile
                          key={photo.id}
                          caption={photo.caption ?? ""}
                          name={photo.caption?.trim() || `${t("clientReport.view.photo")} ${index + 1}`}
                          media={mediaById.get(photo.id)}
                          excluded={excludedPhotos.has(photo.id)}
                          onToggle={() => togglePhoto(photo.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {body.in_progress.length > 0 && (
                  <div className={BLOCK_CLASS}>
                    <span className={BLOCK_TITLE_CLASS}>{t("clientReport.block.inProgress")}</span>
                    {body.in_progress.map((task) => (
                      <ReportLine
                        key={task.id}
                        label={`⏳ ${task.title}`}
                        title={task.title}
                        excluded={excludedTasks.has(task.id)}
                        onToggle={() => toggleTask(task.id)}
                      />
                    ))}
                  </div>
                )}

                {body.next.length > 0 && (
                  <div className={BLOCK_CLASS}>
                    <span className={BLOCK_TITLE_CLASS}>{t("clientReport.block.next")}</span>
                    {body.next.map((task) => {
                      const due = formatReportDay(task.due_at, language);
                      return (
                        <ReportLine
                          key={task.id}
                          label={due ? `${task.title} · ${due}` : task.title}
                          title={task.title}
                          excluded={excludedTasks.has(task.id)}
                          onToggle={() => toggleTask(task.id)}
                        />
                      );
                    })}
                  </div>
                )}

                {(body.progress || stages) && (
                  <div className={BLOCK_CLASS}>
                    <span className={BLOCK_TITLE_CLASS}>{t("clientReport.block.progressAndStages")}</span>
                    {body.progress && (
                      <ReportLine
                        label={t("clientReport.line.progress", {
                          pct: body.progress.pct,
                          done: body.progress.done,
                          total: body.progress.total,
                        })}
                        title={t("clientReport.line.progress", {
                          pct: body.progress.pct,
                          done: body.progress.done,
                          total: body.progress.total,
                        })}
                        excluded={hidden.has("progress")}
                        onToggle={() => toggleHidden("progress")}
                      />
                    )}
                    {stages && (
                      <ReportLine
                        label={t("clientReport.line.stages", { completed: stages.completed, total: stages.total })}
                        title={t("clientReport.line.stages", { completed: stages.completed, total: stages.total })}
                        excluded={hidden.has("stages")}
                        onToggle={() => toggleHidden("stages")}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={!quota.can_publish || nothingToShow || publishing || refreshing || periodBlocked}
                  onClick={() => { void handlePublish(); }}
                >
                  {t("clientReport.publish")}
                </Button>
                {pdfButton}
              </div>
              {pdfLockedHint}
              {limitText && (
                <p className={HINT_CLASS}>
                  {limitText}
                  {quota.plan_code !== "brigade" && (
                    <>
                      {" "}
                      <Link
                        to="/settings?tab=billing"
                        className="whitespace-nowrap font-medium text-accent hover:underline"
                        onClick={() => onOpenChange(false)}
                      >
                        {t("billing.upgradePlan")}
                      </Link>
                    </>
                  )}
                </p>
              )}

              {linkSection && <div className={BLOCK_CLASS}>{linkSection}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {pdfJob && createPortal(
        <div
          aria-hidden="true"
          {...{ inert: "" }}
          style={{ position: "fixed", left: -10000, top: 0, width: PDF_RENDER_WIDTH_PX, pointerEvents: "none" }}
        >
          <ClientReportView ref={pdfRef} data={pdfJob.data} />
        </div>,
        document.body,
      )}

      <ConfirmModal
        open={revokeConfirmOpen}
        onOpenChange={setRevokeConfirmOpen}
        title={t("documents.share.revokeConfirmTitle")}
        description={t("documents.share.revokeConfirmDescription")}
        confirmLabel={t("documents.share.revoke")}
        onConfirm={() => { void handleRevoke(); }}
        onCancel={() => setRevokeConfirmOpen(false)}
      />
    </>
  );
}
