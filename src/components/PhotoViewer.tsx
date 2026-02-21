import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Dialog, DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  ArrowLeft, Star, Trash2, X, Camera, ExternalLink, Sparkles,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  updateMedia, deleteMedia, addEvent, getCurrentUser, getTask, getStage,
  getMedia,
} from "@/data/store";
import { openPhotoConsult } from "@/lib/photo-consult-store";
import { format } from "date-fns";
import { useState } from "react";
import type { Media as MediaType } from "@/types/entities";

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
  const { id: projectId } = useParams<{ id: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  if (!photo) return null;

  const user = getCurrentUser();
  const task = photo.task_id ? getTask(photo.task_id) : undefined;
  const stage = task?.stage_id ? getStage(task.stage_id) : undefined;
  const colorIdx = allPhotos.indexOf(photo);
  const bgColor = placeholderColors[Math.max(0, colorIdx) % placeholderColors.length];

  function handleToggleFinal() {
    if (!photo) return;
    updateMedia(photo.id, { is_final: !photo.is_final });
    toast({ title: photo.is_final ? "Unmarked as final" : "Marked as final" });
  }

  function handleDelete() {
    if (!photo) return;
    deleteMedia(photo.id);
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
    toast({ title: "Photo deleted" });
  }

  function handleTaskClick() {
    if (!task || !projectId) return;
    // Navigate to tasks tab with state to open this specific task
    navigate(`/project/${projectId}/tasks`, {
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
              <span className="text-caption font-medium">Back</span>
            </button>

            <h3 className="text-body-sm font-semibold text-foreground truncate max-w-[50%] text-center">
              {photo.caption}
            </h3>

            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleFinal}
                className={`p-1.5 rounded-md transition-colors ${
                  photo.is_final
                    ? "text-accent bg-accent/10 hover:bg-accent/20"
                    : "text-muted-foreground hover:text-accent hover:bg-accent/10"
                }`}
                title={photo.is_final ? "Unmark as final" : "Mark as final"}
              >
                <Star className="h-4 w-4" fill={photo.is_final ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => setDeleteOpen(true)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete photo"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
            <div className={`w-full aspect-video rounded-lg ${bgColor} flex items-center justify-center relative`}>
              <Camera className="h-16 w-16 text-muted-foreground/20" />
              {photo.is_final && (
                <div className="absolute top-3 right-3 bg-accent rounded-full px-2.5 py-0.5 flex items-center gap-1">
                  <Star className="h-3 w-3 text-accent-foreground" fill="currentColor" />
                  <span className="text-caption text-accent-foreground font-medium">Final</span>
                </div>
              )}
            </div>
          </div>

          {/* Meta block */}
          <div className="px-4 py-3 space-y-2">
            <h4 className="text-body font-semibold text-foreground">{photo.caption}</h4>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
              <span>{format(new Date(photo.created_at), "MMM d, yyyy · HH:mm")}</span>
            </div>

            {/* Task link */}
            {photo.task_id && (
              <div className="pt-1">
                {task ? (
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
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 px-3 py-1 text-caption text-muted-foreground">
                    Task unavailable
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bottom action row */}
          <div className="px-4 pb-4 flex items-center gap-2">
            <Button
              onClick={handleAiConsult}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              size="sm"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI Consult
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleFinal}
            >
              <Star className="h-3.5 w-3.5 mr-1.5" />
              {photo.is_final ? "Unmark final" : "Mark as final"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete photo?"
        description="This will remove the photo from the project and tasks."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
