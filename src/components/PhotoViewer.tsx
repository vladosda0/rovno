import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isAuthenticated } from "@/lib/auth-state";
import { actionStateToControlProps, usePermission } from "@/lib/permissions";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  ArrowLeft, Trash2, X, Camera, ExternalLink, Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  addEvent, getCurrentUser, getTask, getStage,
  getMedia,
} from "@/data/store";
import { useProjectMediaMutations } from "@/hooks/use-documents-media-source";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { openPhotoConsult } from "@/lib/photo-consult-store";
import { format } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Media as MediaType } from "@/types/entities";
import { VisibilityClassBadge } from "@/components/documents/VisibilityClassBadge";
import { MediaImage } from "@/components/MediaImage";

const placeholderColors = [
  "bg-accent/10", "bg-info/10", "bg-warning/10", "bg-muted",
  "bg-success/10", "bg-destructive/10",
];

interface PhotoViewerProps {
  photo: MediaType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where this viewer was opened from */
  source: "gallery" | "task";
  /** All photos for color-index calculation */
  allPhotos?: MediaType[];
}

export function PhotoViewer({ photo, open, onOpenChange, source, allPhotos = [] }: PhotoViewerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { id: routeProjectId } = useParams<{ id: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const permissionProjectId = photo?.project_id ?? routeProjectId ?? "";
  const perm = usePermission(permissionProjectId);
  const { deleteMedia: deleteMediaMutation } = useProjectMediaMutations(permissionProjectId);
  const [isDeleting, setIsDeleting] = useState(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const canUseAiConsult =
    Boolean(photo) &&
    isAuthenticated() &&
    !perm.isLoading &&
    perm.can("ai.generate");

  const deleteMediaControl = actionStateToControlProps(perm.actionState("documents_media", "delete"));

  if (!photo) return null;

  const user = getCurrentUser();
  const task = photo.task_id ? getTask(photo.task_id) : undefined;
  const stage = task?.stage_id ? getStage(task.stage_id) : undefined;
  const colorIdx = allPhotos.indexOf(photo);
  const bgColor = placeholderColors[Math.max(0, colorIdx) % placeholderColors.length];

  async function handleDelete() {
    if (!photo) return;
    if (perm.actionState("documents_media", "delete") !== "enabled") return;
    setIsDeleting(true);
    try {
      await deleteMediaMutation(photo.id);
      addEvent({
        id: `evt-${Date.now()}`,
        project_id: photo.project_id,
        actor_id: user.id,
        type: "photo_deleted",
        object_type: "media",
        object_id: photo.id,
        timestamp: new Date().toISOString(),
        payload: { caption: photo.caption },
      });
      setDeleteOpen(false);
      close();
      toast({ title: t("photoViewer.toast.deleted") });
    } catch (error) {
      toast({
        title: t("photoViewer.toast.deleteFailed.title"),
        description: error instanceof Error ? error.message : t("photoViewer.toast.deleteFailed.description"),
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  function handleTaskClick() {
    if (!task) return;
    const navProjectId = photo.project_id || routeProjectId;
    if (!navProjectId) return;
    navigate(`/project/${navProjectId}/tasks`, {
      state: { openTaskId: task.id },
    });
    close();
  }

  function handleAiConsult() {
    if (!photo) return;
    // Build context and open sidebar
    const siblingPhotos = photo.task_id
      ? getMedia(photo.project_id).filter((m) => m.task_id === photo.task_id && m.id !== photo.id)
      : [];

    openPhotoConsult({
      photo,
      task: task ?? undefined,
      stage: stage ?? undefined,
      siblingPhotos,
    });
    close();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border border-border rounded-modal max-w-2xl shadow-xl p-0 [&>button.absolute]:hidden">
          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <button
              onClick={close}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-caption font-medium">{t("photoViewer.back")}</span>
            </button>

            <div className="flex flex-col items-center max-w-[50%] min-w-0 gap-1">
              <h3 className="text-body-sm font-semibold text-foreground truncate w-full text-center">
                {photo.caption}
              </h3>
              <VisibilityClassBadge visibilityClass={photo.visibility_class} className="text-[10px] px-1.5 py-0" />
            </div>

            <div className="flex items-center gap-1">
              {deleteMediaControl.visible ? (
                <button
                  type="button"
                  onClick={() => !deleteMediaControl.disabled && setDeleteOpen(true)}
                  disabled={deleteMediaControl.disabled}
                  className={`p-1.5 rounded-md transition-colors ${
                    deleteMediaControl.disabled
                      ? "opacity-50 cursor-not-allowed text-muted-foreground"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  }`}
                  title={deleteMediaControl.disabled ? (deleteMediaControl.disabledReason ?? t("photoViewer.notAvailable")) : t("photoViewer.deletePhoto")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              <button
                onClick={close}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Photo preview */}
          <div className="px-4 pt-3">
            <div className={`w-full aspect-video rounded-lg ${bgColor} flex items-center justify-center relative overflow-hidden`}>
              <MediaImage
                storage={photo.storage}
                alt={photo.caption}
                imgClassName="absolute inset-0 h-full w-full object-contain"
                fallback={<Camera className="h-16 w-16 text-muted-foreground/20" />}
              />
            </div>
          </div>

          {/* Meta block */}
          <div className="px-4 py-3 space-y-2">
            <h4 className="text-body font-semibold text-foreground">{photo.caption}</h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
              <span>{format(new Date(photo.created_at), "MMM d, yyyy · HH:mm")}</span>
            </div>

            {/* Task link (only when task is available) */}
            {photo.task_id && task && (
              <div className="pt-1">
                <button
                  onClick={handleTaskClick}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 hover:bg-accent/10 hover:text-accent px-3 py-1 text-caption font-medium text-foreground transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{task.title}</span>
                  {stage && (
                    <span className="text-muted-foreground">· {stage.title}</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Bottom action row */}
          <div className="px-4 pb-4 flex items-center gap-2">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button
                      onClick={canUseAiConsult ? handleAiConsult : undefined}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed"
                      size="sm"
                      disabled
                      aria-disabled="true"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      {t("photoViewer.aiConsult")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t("photoViewer.aiConsultComingSoon")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={(o) => { if (!isDeleting) setDeleteOpen(o); }}
        title={t("photoViewer.confirmDelete.title")}
        description={t("photoViewer.confirmDelete.description")}
        confirmLabel={isDeleting ? t("photoViewer.confirmDelete.deleting") : t("photoViewer.confirmDelete.confirm")}
        confirmDisabled={isDeleting}
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => { if (!isDeleting) setDeleteOpen(false); }}
      />
    </>
  );
}
