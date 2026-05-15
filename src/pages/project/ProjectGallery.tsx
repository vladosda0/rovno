import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Upload, Camera, X, ImageIcon, Sparkles, Check, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PhotoViewer } from "@/components/PhotoViewer";
import { MediaImage } from "@/components/MediaImage";
import { ProjectWorkflowEmptyState } from "@/components/ProjectWorkflowEmptyState";
import { TutorialModal } from "@/components/onboarding/TutorialModal";
import { toast } from "@/hooks/use-toast";
import { useMedia, useTasks, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useMediaUploadMutations, useProjectMediaMutations } from "@/hooks/use-documents-media-source";
import { trackEvent } from "@/lib/analytics";
import { optimizeImageForUpload } from "@/lib/image-optimization";
import { usePermission } from "@/lib/permissions";
import { resolveActionState } from "@/lib/permission-contract-actions";
import { addMedia, addEvent, getCurrentUser } from "@/data/store";
import type { DocMediaVisibilityClass, Media as MediaType } from "@/types/entities";
import { VisibilityClassBadge } from "@/components/documents/VisibilityClassBadge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  canViewInternalDocuments,
  effectiveInternalDocsVisibilityForSeam,
} from "@/lib/internal-docs-visibility";

type UploadSlotStatus = "idle" | "optimizing" | "uploading" | "done" | "error";

interface UploadSlot {
  id: string;
  status: UploadSlotStatus;
  /** Original file picked by the user; kept so we can retry from scratch on failure. */
  rawFile: File | null;
  /** Display filename (may differ from rawFile.name after HEIC -> JPEG conversion). */
  fileName: string;
  /** Comment input value while status === "done". */
  comment: string;
  /** Last comment value persisted via updateMediaCaption; used to dedupe blur saves. */
  lastSavedComment: string;
  mediaId?: string;
  errorMessage?: string;
}

function generateSlotId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `slot-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function makeIdleSlot(): UploadSlot {
  return {
    id: generateSlotId(),
    status: "idle",
    rawFile: null,
    fileName: "",
    comment: "",
    lastSavedComment: "",
  };
}

function isHeicLike(file: File): boolean {
  if (file.type && /^image\/(heic|heif)/i.test(file.type)) return true;
  return /\.(heic|heif)$/i.test(file.name);
}

export default function ProjectGallery() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { t } = useTranslation();
  const photos = useMedia(pid);
  const tasks = useTasks(pid);
  const perm = usePermission(pid);
  const user = getCurrentUser();
  const workspaceMode = useWorkspaceMode();
  const isSupabaseMode = workspaceMode.kind === "supabase";
  const canUploadPhotos = resolveActionState(perm.role, "documents_media", "upload") === "enabled";
  const {
    prepareUpload,
    uploadBytes,
    finalizeUpload,
  } = useMediaUploadMutations(pid);
  const { deleteMedia: deleteMediaMutation, updateMediaCaption } = useProjectMediaMutations(pid);

  const MAX_UPLOAD_FILES = 3;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [uploadVisibilityClass, setUploadVisibilityClass] = useState<DocMediaVisibilityClass>("shared_project");
  const [slots, setSlots] = useState<UploadSlot[]>(() => [makeIdleSlot()]);
  const [viewPhoto, setViewPhoto] = useState<MediaType | null>(null);

  const anySlotBusy = slots.some((s) => s.status === "optimizing" || s.status === "uploading");
  const completedSlotCount = slots.filter((s) => s.status === "done").length;

  const effectiveInternalDocs = useMemo(
    () => effectiveInternalDocsVisibilityForSeam(perm.seam.membership),
    [perm.seam.membership],
  );
  const canSelectInternalUpload = canViewInternalDocuments(effectiveInternalDocs);

  useEffect(() => {
    if (!canSelectInternalUpload && uploadVisibilityClass === "internal") {
      setUploadVisibilityClass("shared_project");
    }
  }, [canSelectInternalUpload, uploadVisibilityClass]);

  const filtered = photos;

  function closeUploadDialog() {
    if (anySlotBusy) return;
    setUploadOpen(false);
    setUploadCaption("");
    setUploadTaskId("");
    setUploadVisibilityClass("shared_project");
    setSlots([makeIdleSlot()]);
  }

  function patchSlot(slotId: string, patch: Partial<UploadSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, ...patch } : s)));
  }

  function ensureTrailingIdleSlot(prev: UploadSlot[]): UploadSlot[] {
    const doneOrBusy = prev.filter(
      (s) => s.status === "done" || s.status === "optimizing" || s.status === "uploading",
    ).length;
    const hasIdle = prev.some((s) => s.status === "idle");
    if (doneOrBusy < MAX_UPLOAD_FILES && !hasIdle) {
      return [...prev, makeIdleSlot()];
    }
    return prev;
  }

  // Demo/local mode: a single click adds a mock media row (no actual upload).
  function handleDemoUpload() {
    const mediaId = `media-${Date.now()}`;
    addMedia({
      id: mediaId,
      project_id: pid,
      task_id: uploadTaskId || undefined,
      uploader_id: user.id,
      caption: uploadCaption || t("gallery.defaults.photoCaption"),
      is_final: false,
      created_at: new Date().toISOString(),
      visibility_class: uploadVisibilityClass,
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "photo_uploaded",
      object_type: "media",
      object_id: mediaId,
      timestamp: new Date().toISOString(),
      payload: { caption: uploadCaption },
    });
    trackEvent("media_uploaded", { project_id: pid });
    setUploadOpen(false);
    setUploadCaption("");
    setUploadTaskId("");
    setUploadVisibilityClass("shared_project");
    toast({ title: t("gallery.toast.photoUploaded") });
  }

  async function processSlot(slotId: string, rawFile: File) {
    patchSlot(slotId, {
      status: "optimizing",
      rawFile,
      fileName: rawFile.name,
      errorMessage: undefined,
    });

    // 1. Optimize (HEIC decode + resize + re-encode). Non-fatal: fall back to
    //    the original file if the pipeline throws.
    let workingFile = rawFile;
    const wasHeic = isHeicLike(rawFile);
    try {
      const result = await optimizeImageForUpload(rawFile);
      workingFile = result.file;
      if (wasHeic && workingFile.type === "image/jpeg") {
        toast({ title: t("gallery.toast.heicConverted") });
      }
    } catch (optError) {
      // eslint-disable-next-line no-console
      console.warn("[gallery] image optimization failed; uploading original", {
        filename: rawFile.name,
        type: rawFile.type,
        size: rawFile.size,
        message: optError instanceof Error ? optError.message : String(optError),
      });
    }

    patchSlot(slotId, { status: "uploading", fileName: workingFile.name });

    // 2. Prepare + upload bytes + finalize. Any failure here lands in the
    //    error branch so the user can retry just this slot.
    try {
      const intent = await prepareUpload({
        mediaType: "photo",
        clientFilename: workingFile.name,
        mimeType: workingFile.type || "image/jpeg",
        sizeBytes: workingFile.size,
        caption: undefined,
        visibilityClass: uploadVisibilityClass,
      });

      await uploadBytes(intent.bucket, intent.objectPath, workingFile);

      const finalized = await finalizeUpload(intent.uploadIntentId);

      patchSlot(slotId, {
        status: "done",
        mediaId: finalized.projectMediaId,
      });
      setSlots((prev) => ensureTrailingIdleSlot(prev));
      trackEvent("media_uploaded", { project_id: pid });
      toast({ title: t("gallery.toast.photoUploaded") });
    } catch (error) {
      patchSlot(slotId, {
        status: "error",
        errorMessage: error instanceof Error ? error.message : t("gallery.toast.uploadFailed.description"),
      });
      toast({
        title: t("gallery.toast.uploadFailed.title"),
        description: error instanceof Error ? error.message : t("gallery.toast.uploadFailed.description"),
        variant: "destructive",
      });
    }
  }

  async function handleSlotRetry(slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !slot.rawFile) return;
    await processSlot(slotId, slot.rawFile);
  }

  async function handleSlotRemove(slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (slot.mediaId) {
      try {
        await deleteMediaMutation(slot.mediaId);
        toast({ title: t("gallery.toast.photoRemoved") });
      } catch (error) {
        toast({
          title: t("gallery.toast.removeFailed.title"),
          description: error instanceof Error ? error.message : t("gallery.toast.removeFailed.description"),
          variant: "destructive",
        });
        return;
      }
    }

    setSlots((prev) => {
      const filtered = prev.filter((s) => s.id !== slotId);
      if (filtered.length === 0) return [makeIdleSlot()];
      return ensureTrailingIdleSlot(filtered);
    });
  }

  async function commitSlotComment(slotId: string) {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot || !slot.mediaId) return;
    if (slot.comment === slot.lastSavedComment) return;
    try {
      await updateMediaCaption(slot.mediaId, slot.comment);
      patchSlot(slotId, { lastSavedComment: slot.comment });
    } catch (error) {
      toast({
        title: t("gallery.toast.commentFailed.title"),
        description: error instanceof Error ? error.message : t("gallery.toast.commentFailed.description"),
        variant: "destructive",
      });
    }
  }

  /* placeholder colors for mock thumbnails */
  const placeholderColors = [
    "bg-accent/10", "bg-info/10", "bg-warning/10", "bg-muted",
    "bg-success/10", "bg-destructive/10",
  ];

  const isEmpty = photos.length === 0;

  return (
    <>
      <TutorialModal
        tutorialKey="media"
        steps={[
          {
            titleKey: "tutorial.media.step1.title",
            descriptionKey: "tutorial.media.step1.description",
            visual: (
              <div className="w-full space-y-2">
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted/50">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex aspect-square items-center justify-center rounded-md border border-border bg-muted/50">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex aspect-square items-center justify-center rounded-md border border-accent/40 bg-accent/10">
                    <Sparkles className="h-5 w-5 text-accent" />
                  </div>
                </div>
                <p className="text-caption text-muted-foreground text-center">{t("tutorial.media.step1.aiHint")}</p>
              </div>
            ),
            icon: <Camera className="h-8 w-8 text-accent" />,
          },
        ]}
      />
      {isEmpty ? (
        <ProjectWorkflowEmptyState
          variant="gallery"
          title={t("gallery.empty.title")}
          description={t("gallery.empty.description")}
          actionLabel={canUploadPhotos ? t("gallery.empty.action") : undefined}
          onAction={canUploadPhotos ? () => setUploadOpen(true) : undefined}
        />
      ) : (
        <div className="space-y-sp-2">
          {/* Header */}
          <div className="glass-elevated rounded-card p-sp-2 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-h3 text-foreground">{t("gallery.heading")}</h2>
              <p className="text-caption text-muted-foreground">
                {t("gallery.summaryTotal", { count: photos.length })}
              </p>
            </div>
            {canUploadPhotos && (
              <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Upload className="h-4 w-4 mr-1.5" /> {t("gallery.upload")}
              </Button>
            )}
          </div>

          {/* Grid */}
          <div className="glass rounded-card p-sp-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filtered.map((photo, idx) => {
                const task = tasks.find((t) => t.id === photo.task_id);
                return (
                  <button
                    key={photo.id}
                    onClick={() => setViewPhoto(photo)}
                    className="group relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-accent/40 transition-all"
                  >
                    <MediaImage
                      storage={photo.storage}
                      alt={photo.caption}
                      imgClassName="absolute inset-0 h-full w-full object-cover"
                      fallback={
                        <div className={`absolute inset-0 ${placeholderColors[idx % placeholderColors.length]} flex items-center justify-center`}>
                          <Camera className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      }
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-caption text-foreground truncate">{photo.caption}</p>
                      {task && <p className="text-[10px] text-muted-foreground truncate">{task.title}</p>}
                    </div>
                    <div className="absolute top-1.5 left-1.5 max-w-[calc(100%-2.5rem)]">
                      <VisibilityClassBadge visibilityClass={photo.visibility_class} className="text-[10px] px-1.5 py-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <PhotoViewer
            photo={viewPhoto}
            open={!!viewPhoto}
            onOpenChange={(o) => !o && setViewPhoto(null)}
            source="gallery"
            allPhotos={photos}
          />
        </div>
      )}

      {/* Upload modal — always mounted so empty-state action works */}
      <AlertDialog open={uploadOpen} onOpenChange={(open) => { if (!open) closeUploadDialog(); else setUploadOpen(true); }}>
        <AlertDialogContent className="bg-card border border-border shadow-xl rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gallery.upload.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gallery.upload.dialogDescription", { max: MAX_UPLOAD_FILES })}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <label className="text-body-sm font-medium text-foreground">{t("gallery.upload.photoLabel")}</label>
              {isSupabaseMode ? (
                <>
                  {slots.map((slot, idx) => (
                    <div key={slot.id} className="space-y-1.5">
                      {slot.status === "idle" && (
                        <FileInput
                          accept="image/*,image/heic,image/heif,.heic,.heif"
                          disabled={anySlotBusy}
                          chooseLabel={
                            idx === 0
                              ? t("gallery.upload.slot.chooseFirst")
                              : t("gallery.upload.slot.chooseAnother")
                          }
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              void processSlot(slot.id, file);
                            }
                          }}
                        />
                      )}
                      {(slot.status === "optimizing" || slot.status === "uploading") && (
                        <div className="flex h-10 items-center gap-2 rounded-input border border-border bg-background px-3">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          <span className="flex-1 truncate text-body-sm text-foreground">{slot.fileName}</span>
                          <span className="text-caption text-muted-foreground">
                            {slot.status === "optimizing"
                              ? t("gallery.upload.slot.optimizing")
                              : t("gallery.upload.slot.uploading")}
                          </span>
                        </div>
                      )}
                      {slot.status === "done" && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleSlotRemove(slot.id)}
                            className="group flex h-10 w-full items-center gap-2 rounded-input border border-success/40 bg-success/5 px-3 text-left transition-colors hover:border-destructive/40 hover:bg-destructive/5"
                            title={t("gallery.upload.slot.removeHint")}
                          >
                            <Check className="h-3.5 w-3.5 text-success group-hover:hidden" />
                            <X className="hidden h-3.5 w-3.5 text-destructive group-hover:inline-block" />
                            <span className="flex-1 truncate text-body-sm text-foreground">{slot.fileName}</span>
                          </button>
                          <Input
                            value={slot.comment}
                            placeholder={t("gallery.upload.commentPlaceholder")}
                            onChange={(e) => patchSlot(slot.id, { comment: e.target.value })}
                            onBlur={() => void commitSlotComment(slot.id)}
                          />
                        </>
                      )}
                      {slot.status === "error" && (
                        <div className="flex h-10 items-center gap-2 rounded-input border border-destructive/40 bg-destructive/5 px-3">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                          <span className="flex-1 truncate text-body-sm text-foreground">
                            {slot.fileName || t("gallery.upload.slot.errorFallback")}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleSlotRetry(slot.id)}
                          >
                            {t("gallery.upload.slot.retry")}
                          </Button>
                          <button
                            type="button"
                            onClick={() => void handleSlotRemove(slot.id)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={t("gallery.upload.slot.removeHint")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-caption text-muted-foreground">
                    {t("gallery.upload.maxHint", { max: MAX_UPLOAD_FILES })}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {t("gallery.upload.formatsHint")}
                  </p>
                </>
              ) : (
                <>
                  <FileInput accept="image/*" disabled={anySlotBusy} />
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center mt-2">
                    <Camera className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                    <p className="text-caption text-muted-foreground">{t("gallery.upload.dropHint")}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-body-sm font-medium text-foreground">{t("gallery.upload.commentLabel")}</label>
                    <Input
                      value={uploadCaption}
                      onChange={(e) => setUploadCaption(e.target.value)}
                      placeholder={t("gallery.upload.commentPlaceholder")}
                      disabled={anySlotBusy}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-body-sm font-medium text-foreground">{t("gallery.upload.visibilityLabel")}</Label>
              <RadioGroup
                value={uploadVisibilityClass}
                onValueChange={(v) => setUploadVisibilityClass(v as DocMediaVisibilityClass)}
                className="flex flex-col gap-2"
                disabled={anySlotBusy}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="shared_project" id="gal-vis-shared" />
                  <Label htmlFor="gal-vis-shared" className="font-normal cursor-pointer">{t("gallery.upload.visibilityShared")}</Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="internal" id="gal-vis-internal" disabled={!canSelectInternalUpload} />
                  <div>
                    <Label
                      htmlFor="gal-vis-internal"
                      className={`font-normal ${canSelectInternalUpload ? "cursor-pointer" : "text-muted-foreground"}`}
                    >
                      {t("gallery.upload.visibilityInternal")}
                    </Label>
                    {!canSelectInternalUpload && (
                      <p className="text-caption text-muted-foreground">{t("gallery.upload.visibilityInternalUnavailable")}</p>
                    )}
                  </div>
                </div>
              </RadioGroup>
            </div>
            {!isSupabaseMode && (
              <div className="space-y-1">
                <label className="text-body-sm font-medium text-foreground">{t("gallery.upload.taskLabel")}</label>
                <select
                  value={uploadTaskId}
                  onChange={(e) => setUploadTaskId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={anySlotBusy}
                >
                  <option value="">{t("gallery.upload.taskNone")}</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>{task.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            {isSupabaseMode ? (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); closeUploadDialog(); }}
                className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
                disabled={anySlotBusy}
              >
                {anySlotBusy
                  ? t("gallery.upload.preparing")
                  : completedSlotCount > 0
                    ? t("gallery.upload.done")
                    : t("common.cancel")}
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); handleDemoUpload(); }}
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {t("gallery.upload.submit")}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
