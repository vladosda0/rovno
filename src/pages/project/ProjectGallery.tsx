import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Upload, Camera, Star, X, ImageIcon, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PhotoViewer } from "@/components/PhotoViewer";
import { ProjectWorkflowEmptyState } from "@/components/ProjectWorkflowEmptyState";
import { TutorialModal } from "@/components/onboarding/TutorialModal";
import { toast } from "@/hooks/use-toast";
import { useMedia, useTasks, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useMediaUploadMutations } from "@/hooks/use-documents-media-source";
import { trackEvent } from "@/lib/analytics";
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

  const [filter, setFilter] = useState<"all" | "final" | "progress">("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadTaskId, setUploadTaskId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVisibilityClass, setUploadVisibilityClass] = useState<DocMediaVisibilityClass>("shared_project");
  const [uploading, setUploading] = useState(false);
  const [pendingFinalizeIntentId, setPendingFinalizeIntentId] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<MediaType | null>(null);

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

  const filtered = photos.filter((p) => {
    if (filter === "final") return p.is_final;
    if (filter === "progress") return !p.is_final;
    return true;
  });

  function closeUploadDialog() {
    setUploadOpen(false);
    setUploadCaption("");
    setUploadTaskId("");
    setUploadFile(null);
    setUploadVisibilityClass("shared_project");
    setUploading(false);
    setPendingFinalizeIntentId(null);
  }

  async function handleUpload() {
    if (!isSupabaseMode) {
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
      closeUploadDialog();
      toast({ title: t("gallery.toast.photoUploaded") });
      return;
    }

    if (!uploadFile) {
      toast({ title: t("gallery.toast.selectFile"), variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const intent = await prepareUpload({
        mediaType: "photo",
        clientFilename: uploadFile.name,
        mimeType: uploadFile.type || "image/jpeg",
        sizeBytes: uploadFile.size,
        caption: uploadCaption || undefined,
        visibilityClass: uploadVisibilityClass,
      });

      await uploadBytes(intent.bucket, intent.objectPath, uploadFile);

      setPendingFinalizeIntentId(intent.uploadIntentId);
      await finalizeUpload(intent.uploadIntentId);

      trackEvent("media_uploaded", { project_id: pid });
      closeUploadDialog();
      toast({ title: t("gallery.toast.photoUploaded") });
    } catch (error) {
      setUploading(false);
      toast({
        title: t("gallery.toast.uploadFailed.title"),
        description: error instanceof Error ? error.message : t("gallery.toast.uploadFailed.description"),
        variant: "destructive",
      });
    }
  }

  async function handleRetryFinalize() {
    if (!pendingFinalizeIntentId) return;

    setUploading(true);
    try {
      await finalizeUpload(pendingFinalizeIntentId);

      trackEvent("media_uploaded", { project_id: pid });
      closeUploadDialog();
      toast({ title: t("gallery.toast.photoUploaded"), description: t("gallery.toast.finalized.description") });
    } catch (error) {
      setUploading(false);
      toast({
        title: t("gallery.toast.finalizeFailed.title"),
        description: error instanceof Error ? error.message : t("gallery.toast.finalizeFailed.description"),
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
                {t("gallery.summary", { total: photos.length, final: photos.filter((p) => p.is_final).length })}
              </p>
            </div>
            {canUploadPhotos && (
              <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Upload className="h-4 w-4 mr-1.5" /> {t("gallery.upload")}
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-1.5">
            {(["all", "progress", "final"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-pill px-3 py-1 text-caption font-medium transition-colors border ${
                  filter === f
                    ? "bg-accent/10 text-accent border-accent/20"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                {f === "all" ? t("gallery.filters.all") : f === "final" ? t("gallery.filters.final") : t("gallery.filters.progress")}
              </button>
            ))}
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
                    <div className={`absolute inset-0 ${placeholderColors[idx % placeholderColors.length]} flex items-center justify-center`}>
                      <Camera className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-caption text-foreground truncate">{photo.caption}</p>
                      {task && <p className="text-[10px] text-muted-foreground truncate">{task.title}</p>}
                    </div>
                    <div className="absolute top-1.5 left-1.5 max-w-[calc(100%-2.5rem)]">
                      <VisibilityClassBadge visibilityClass={photo.visibility_class} className="text-[10px] px-1.5 py-0" />
                    </div>
                    {photo.is_final && (
                      <div className="absolute top-1.5 right-1.5 bg-accent rounded-full p-0.5">
                        <Star className="h-3 w-3 text-accent-foreground" fill="currentColor" />
                      </div>
                    )}
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
            <AlertDialogDescription>{t("gallery.upload.dialogDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            {pendingFinalizeIntentId && (
              <div className="rounded-panel bg-destructive/10 p-3 text-caption text-destructive">
                {t("gallery.upload.retryBanner")}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">{t("gallery.upload.photoLabel")}</label>
              <Input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  setUploadFile(e.target.files?.[0] ?? null);
                }}
              />
              {!isSupabaseMode && (
                <div className="border-2 border-dashed border-border rounded-lg p-8 text-center mt-2">
                  <Camera className="mx-auto h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-caption text-muted-foreground">{t("gallery.upload.dropHint")}</p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">{t("gallery.upload.captionLabel")}</label>
              <Input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder={t("gallery.upload.captionPlaceholder")} disabled={uploading} />
            </div>
            <div className="space-y-2">
              <Label className="text-body-sm font-medium text-foreground">{t("gallery.upload.visibilityLabel")}</Label>
              <RadioGroup
                value={uploadVisibilityClass}
                onValueChange={(v) => setUploadVisibilityClass(v as DocMediaVisibilityClass)}
                className="flex flex-col gap-2"
                disabled={uploading}
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
                  disabled={uploading}
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
            <AlertDialogCancel disabled={uploading}>{t("common.cancel")}</AlertDialogCancel>
            {pendingFinalizeIntentId ? (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleRetryFinalize(); }}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={uploading}
              >
                {uploading ? t("gallery.upload.retrySubmitting") : t("gallery.upload.retrySubmit")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleUpload(); }}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={uploading || (isSupabaseMode && !uploadFile)}
              >
                {uploading ? t("gallery.upload.submitting") : t("gallery.upload.submit")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
