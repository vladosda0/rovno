import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PhotoViewer } from "@/components/PhotoViewer";
import { getUserById } from "@/data/store";
import { useToast } from "@/hooks/use-toast";
import {
  Send, CheckSquare, Trash2, Plus, X, Calendar, Camera, Image, Upload, Loader2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Task, TaskStatus, Media as MediaType } from "@/types/entities";
import { useMediaUploadMutations } from "@/hooks/use-documents-media-source";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { ResourceLineType } from "@/types/estimate-v2";

const statusLabel: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const statuses: TaskStatus[] = ["not_started", "in_progress", "done", "blocked"];

interface Props {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageTask: boolean;
  canChangeStatus: boolean;
  canEditChecklist: boolean;
  canComment: boolean;
  canUploadMedia: boolean;
  estimateLinkedPlanningReadOnly?: boolean;
  taskStructureReadOnly?: boolean;
  blockEstimateLinkedDelete?: boolean;
  disableStatusChanges?: boolean;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  onTitleChange?: (taskId: string, title: string) => Promise<void> | void;
  onDescriptionChange?: (taskId: string, description: string) => Promise<void> | void;
  onDeadlineChange?: (taskId: string, deadline?: string) => Promise<void> | void;
  onDeleteTask?: (taskId: string) => Promise<void> | void;
  projectMedia?: MediaType[];
  onChecklistToggle?: (taskId: string, itemId: string, done: boolean) => Promise<void> | void;
  onChecklistAdd?: (taskId: string, text: string) => Promise<void> | void;
  onChecklistDelete?: (taskId: string, itemId: string) => Promise<void> | void;
  onAddComment?: (taskId: string, body: string) => Promise<void> | void;
}

export function TaskDetailModal({
  task,
  open,
  onOpenChange,
  canManageTask,
  canChangeStatus,
  canEditChecklist,
  canComment,
  canUploadMedia,
  estimateLinkedPlanningReadOnly = false,
  taskStructureReadOnly = false,
  blockEstimateLinkedDelete = false,
  disableStatusChanges = false,
  onStatusChange,
  onTitleChange,
  onDescriptionChange,
  onDeadlineChange,
  onDeleteTask,
  projectMedia,
  onChecklistToggle,
  onChecklistAdd,
  onChecklistDelete,
  onAddComment,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { prepareUpload, uploadBytes, finalizeUpload } = useMediaUploadMutations(task?.project_id ?? "");
  const [commentText, setCommentText] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pendingChecklist, setPendingChecklist] = useState<{ itemId: string; nextDone: boolean } | null>(null);
  const [pendingChecklistItemIds, setPendingChecklistItemIds] = useState<Record<string, boolean>>({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const structureReadOnly = estimateLinkedPlanningReadOnly || taskStructureReadOnly;

  // PhotoViewer
  const [viewerPhoto, setViewerPhoto] = useState<MediaType | null>(null);
  const taskId = task?.id;
  const taskDescription = task?.description;
  const taskTitle = task?.title;

  // Sync drafts
  useEffect(() => {
    if (taskId && taskDescription != null && taskTitle != null) {
      setDescDraft(taskDescription);
      setTitleDraft(taskTitle);
    }
  }, [taskId, taskDescription, taskTitle]);

  // Close title editing when modal closes
  useEffect(() => {
    if (!open) setEditingTitle(false);
  }, [open]);

  const handleStatusChange = useCallback((status: TaskStatus) => {
    if (!task) return;
    if (disableStatusChanges) return;
    if (onStatusChange) {
      onStatusChange(task.id, status);
    }
  }, [task, disableStatusChanges, onStatusChange]);

  // Title inline edit
  const handleTitleSave = useCallback(() => {
    if (!task || !titleDraft.trim()) {
      setTitleDraft(task?.title ?? "");
      setEditingTitle(false);
      return;
    }
    if (structureReadOnly) {
      setTitleDraft(task.title);
      setEditingTitle(false);
      return;
    }
    if (titleDraft.trim() !== task.title) {
      void Promise.resolve(onTitleChange?.(task.id, titleDraft.trim())).catch((error) => {
        toast({
          title: "Unable to rename task",
          description: error instanceof Error ? error.message : "Task title was not updated.",
          variant: "destructive",
        });
        setTitleDraft(task.title);
      });
    }
    setEditingTitle(false);
  }, [onTitleChange, structureReadOnly, task, titleDraft, toast]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleTitleSave(); }
    if (e.key === "Escape") { setTitleDraft(task?.title ?? ""); setEditingTitle(false); }
  }, [handleTitleSave, task]);

  const handleDescBlur = useCallback(() => {
    if (!task) return;
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    if (descDraft !== task.description) {
      void Promise.resolve(onDescriptionChange?.(task.id, descDraft)).catch((error) => {
        toast({
          title: "Unable to update description",
          description: error instanceof Error ? error.message : "Task description was not updated.",
          variant: "destructive",
        });
        setDescDraft(task.description);
      });
    }
  }, [descDraft, onDescriptionChange, task, toast]);

  const handleDescChange = useCallback((val: string) => {
    setDescDraft(val);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => {
      if (!task) return;
      void Promise.resolve(onDescriptionChange?.(task.id, val)).catch((error) => {
        toast({
          title: "Unable to update description",
          description: error instanceof Error ? error.message : "Task description was not updated.",
          variant: "destructive",
        });
        setDescDraft(task.description);
      });
    }, 800);
  }, [onDescriptionChange, task, toast]);

  const getChecklistResourceType = useCallback((item: Task["checklist"][number]): ResourceLineType => {
    if (item.estimateV2ResourceType === "material") return "material";
    if (item.estimateV2ResourceType === "tool") return "tool";
    if (item.estimateV2ResourceType === "labor") return "labor";
    if (item.estimateV2ResourceType === "subcontractor") return "subcontractor";
    if (item.type === "material") return "material";
    if (item.type === "tool") return "tool";
    return "other";
  }, []);

  const getChecklistResourceLabel = useCallback((item: Task["checklist"][number]): string | null => {
    if (item.estimateV2ResourceType) return null;
    if (item.type === "material" || item.type === "tool") return null;
    if (item.estimateV2LineId || item.estimateV2WorkId) return "Estimate item";
    return null;
  }, []);

  const toggleChecklistItem = useCallback(async (itemId: string, nextDone: boolean) => {
    if (!task || !onChecklistToggle) return;
    setPendingChecklistItemIds((prev) => ({ ...prev, [itemId]: true }));
    try {
      await onChecklistToggle(task.id, itemId, nextDone);
    } finally {
      setPendingChecklistItemIds((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }, [task, onChecklistToggle]);

  const handleChecklistToggle = useCallback((itemId: string) => {
    if (!task) return;
    if (pendingChecklistItemIds[itemId]) return;
    const item = task.checklist.find((entry) => entry.id === itemId);
    if (!item) return;
    const nextDone = !item.done;
    const isLinked = Boolean(item.procurementItemId || item.estimateV2LineId || item.estimateV2WorkId);
    if (isLinked && nextDone) {
      setPendingChecklist({ itemId, nextDone });
      return;
    }
    void toggleChecklistItem(itemId, nextDone);
  }, [task, pendingChecklistItemIds, toggleChecklistItem]);

  const handleAddCheckItem = useCallback(() => {
    if (!task || !newCheckItem.trim()) return;
    void onChecklistAdd?.(task.id, newCheckItem.trim());
    setNewCheckItem("");
  }, [task, newCheckItem, onChecklistAdd]);

  const handleAddComment = useCallback(() => {
    if (!task || !commentText.trim()) return;
    void onAddComment?.(task.id, commentText.trim());
    setCommentText("");
  }, [task, commentText, onAddComment]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    if (structureReadOnly && blockEstimateLinkedDelete) {
      toast({
        title: "Task structure is managed from Estimate",
        description: "Delete task structure from Estimate in Supabase mode.",
        variant: "destructive",
      });
      return;
    }
    void Promise.resolve(onDeleteTask?.(task.id))
      .then(() => {
        setDeleteOpen(false);
        onOpenChange(false);
        toast({ title: "Task deleted" });
      })
      .catch((error) => {
        toast({
          title: "Unable to delete task",
          description: error instanceof Error ? error.message : "Task was not deleted.",
          variant: "destructive",
        });
      });
  }, [blockEstimateLinkedDelete, onDeleteTask, onOpenChange, structureReadOnly, task, toast]);

  const handleDeadlineChange = useCallback((date: Date | undefined) => {
    if (!task) return;
    if (structureReadOnly) return;
    void Promise.resolve(onDeadlineChange?.(task.id, date?.toISOString())).catch((error) => {
      toast({
        title: "Unable to update deadline",
        description: error instanceof Error ? error.message : "Task deadline was not updated.",
        variant: "destructive",
      });
    });
  }, [onDeadlineChange, structureReadOnly, task, toast]);

  if (!task) return null;

  const assignees = (task.assignees ?? [])
    .map((assignee, index) => {
      const user = assignee.id ? getUserById(assignee.id) : null;
      const label = assignee.name?.trim() || user?.name || assignee.email?.trim() || null;
      const initial = (label ?? user?.name ?? "").trim().charAt(0).toUpperCase() || "?";
      return {
        key: assignee.id ?? assignee.email ?? assignee.name ?? `assignee-${index}`,
        label: label ?? "Unassigned",
        initial,
      };
    })
    .filter((assignee, index, list) => list.findIndex((entry) => entry.key === assignee.key) === index);
  const legacyAssignee = task.assignee_id ? getUserById(task.assignee_id) : null;
  const visibleAssignees = assignees.length > 0
    ? assignees
    : legacyAssignee
      ? [{
          key: legacyAssignee.id,
          label: legacyAssignee.name,
          initial: legacyAssignee.name.charAt(0).toUpperCase(),
        }]
      : [];
  const checkDone = task.checklist.filter((c) => c.done).length;
  const sortedComments = [...task.comments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Task media from project media
  const taskMedia = (projectMedia ?? []).filter((m) => m.task_id === task.id);

  const placeholderColors = [
    "bg-accent/10", "bg-info/10", "bg-warning/10", "bg-muted",
    "bg-success/10", "bg-destructive/10",
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-card border border-border rounded-modal max-w-lg max-h-[85vh] overflow-y-auto shadow-xl p-0 [&>button.absolute]:hidden">
          <DialogTitle className="sr-only">{task.title}</DialogTitle>
          <DialogDescription className="sr-only">
            Review task details, update checklist progress, manage comments, and browse attached media.
          </DialogDescription>
          {/* Header */}
          <div className="flex items-start justify-between p-sp-3 pb-0">
            <div className="flex-1 min-w-0 pr-2">
              {editingTitle && canManageTask && !estimateLinkedPlanningReadOnly ? (
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={handleTitleKeyDown}
                  autoFocus
                  className="text-lg font-semibold text-foreground bg-transparent border-b-2 border-accent outline-none w-full py-0.5"
                />
              ) : (
                <h2
                  className={`text-lg font-semibold text-foreground truncate ${canManageTask && !structureReadOnly ? "cursor-text hover:text-accent transition-colors" : ""}`}
                  onClick={() => {
                    if (canManageTask && !structureReadOnly) {
                      setEditingTitle(true);
                      setTimeout(() => titleInputRef.current?.focus(), 0);
                    }
                  }}
                >
                  {task.title}
                </h2>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              {canManageTask && !structureReadOnly && onDeleteTask && (
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete task"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-sp-3 p-sp-3 pt-sp-2">
            {/* Status */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {statuses.map((s) => (
                  <button
                    key={s}
                    disabled={!canChangeStatus || disableStatusChanges}
                    onClick={() => handleStatusChange(s)}
                    className={`rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
                      task.status === s
                        ? s === "not_started" ? "bg-muted text-foreground ring-1 ring-border"
                        : s === "in_progress" ? "bg-info/15 text-info ring-1 ring-info/30"
                        : s === "done" ? "bg-success/15 text-success ring-1 ring-success/30"
                        : "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {statusLabel[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Description</p>
              {canManageTask ? (
                <Textarea
                  value={descDraft}
                  onChange={(e) => handleDescChange(e.target.value)}
                  onBlur={handleDescBlur}
                  rows={3}
                  placeholder="Click to add description…"
                  className="text-sm bg-muted/30 border-border"
                />
              ) : (
                <p className="text-sm text-foreground whitespace-pre-wrap rounded-lg p-2 bg-muted/30">
                  {task.description || "No description"}
                </p>
              )}
            </div>

            {/* Assignee */}
            {visibleAssignees.length > 0 && (
              <div>
                <p className="text-caption text-muted-foreground mb-1">Assignees</p>
                <div className="flex flex-wrap items-center gap-2">
                  {visibleAssignees.map((assignee) => (
                    <div key={assignee.key} className="inline-flex items-center gap-2 rounded-full bg-muted/40 px-2 py-1">
                      <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center">
                        <span className="text-[10px] font-semibold text-accent">{assignee.initial}</span>
                      </div>
                      <span className="text-sm text-foreground">{assignee.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dates row */}
            <div className="flex gap-sp-3 flex-wrap">
              <div>
                <p className="text-caption text-muted-foreground mb-1">Created</p>
                <span className="text-caption text-foreground">
                  {task.created_at ? format(new Date(task.created_at), "MMM d, yyyy") : "—"}
                </span>
              </div>
              <div>
                <p className="text-caption text-muted-foreground mb-1">Deadline</p>
                {canManageTask && !structureReadOnly ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-7 text-caption justify-start",
                          !task.deadline && "text-muted-foreground"
                        )}
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        {task.deadline ? format(new Date(task.deadline), "MMM d, yyyy") : "Set deadline"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={task.deadline ? new Date(task.deadline) : undefined}
                        onSelect={handleDeadlineChange}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <span className="text-caption text-foreground">
                    {task.deadline ? format(new Date(task.deadline), "MMM d, yyyy") : "—"}
                  </span>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div>
              <p className="text-caption text-muted-foreground mb-1 flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" /> Checklist
                {task.checklist.length > 0 && ` (${checkDone}/${task.checklist.length})`}
              </p>
               <div className="space-y-1">
                {task.checklist.map((item) => {
                  const resourceType = getChecklistResourceType(item);
                  const resourceLabel = getChecklistResourceLabel(item);
                  const isLinked = Boolean(item.procurementItemId || item.estimateV2LineId || item.estimateV2WorkId);
                  const isPending = Boolean(pendingChecklistItemIds[item.id]);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 rounded-lg bg-muted/40 p-1.5 px-2 group"
                    >
                      <Checkbox
                        checked={item.done}
                        disabled={!canEditChecklist || isPending}
                        onCheckedChange={() => handleChecklistToggle(item.id)}
                      />
                      <span className={`text-caption flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {item.text}
                      </span>
                      {(resourceType !== "other" || resourceLabel) && (
                        <ResourceTypeBadge
                          type={resourceType}
                          className="h-5 px-1.5 text-[10px]"
                          labelOverride={resourceLabel ?? undefined}
                        />
                      )}
                      {isPending && (
                        <span className="inline-flex items-center text-[10px] text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      )}
                      {canEditChecklist && !structureReadOnly && !isLinked && (
                        <button
                          onClick={() => void onChecklistDelete?.(task.id, item.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {canEditChecklist && !structureReadOnly && (
                <div className="flex gap-1.5 mt-1.5">
                  <Input
                    value={newCheckItem}
                    onChange={(e) => setNewCheckItem(e.target.value)}
                    placeholder="Add item…"
                    className="text-caption h-7"
                    onKeyDown={(e) => e.key === "Enter" && handleAddCheckItem()}
                  />
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleAddCheckItem}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Media section */}
            <div>
              <p className="text-caption text-muted-foreground mb-1 flex items-center gap-1">
                <Image className="h-3.5 w-3.5" /> Media ({taskMedia.length})
              </p>
              {taskMedia.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {taskMedia.map((photo, idx) => (
                    <button
                      key={photo.id}
                      onClick={() => setViewerPhoto(photo)}
                      className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-accent/40 transition-all relative"
                    >
                      <div className={`absolute inset-0 ${placeholderColors[idx % placeholderColors.length]} flex items-center justify-center`}>
                        <Camera className="h-5 w-5 text-muted-foreground/30" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {taskMedia.length === 0 && (
                <p className="text-[11px] text-muted-foreground mb-1">No photos attached to this task.</p>
              )}
              {canUploadMedia && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-caption h-7 mt-1"
                  onClick={() => { setUploadCaption(""); setUploadOpen(true); }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add photos
                </Button>
              )}
            </div>

            {/* Comments */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Comments ({task.comments.length})</p>
              {canComment && (
                <div className="flex gap-1.5 mb-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="text-caption h-8"
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                  />
                  <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleAddComment}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="space-y-1.5">
                {sortedComments.map((c) => {
                  const author = getUserById(c.author_id);
                  return (
                    <div key={c.id} className="rounded-lg bg-muted/40 p-1.5 px-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-caption font-medium text-foreground">{author?.name ?? "Unknown"}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(c.created_at), "MMM d, HH:mm")}
                        </span>
                      </div>
                      <p className="text-caption text-foreground">{c.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Close button */}
            <div className="flex justify-end pt-sp-1">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete task?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      {/* Upload Media modal */}
      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent className="bg-card border border-border shadow-xl rounded-modal z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload Media</AlertDialogTitle>
            <AlertDialogDescription>Add photos to this task with an optional caption.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-accent/40 transition-colors space-y-2">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <Input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
              />
              <p className="text-caption text-muted-foreground">
                {uploadFiles.length > 0 ? `${uploadFiles.length} file(s) selected` : "Select one or more photos"}
              </p>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Caption (optional)</label>
              <Input value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} placeholder="e.g. Kitchen wiring complete" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={async (event) => {
                event.preventDefault();
                if (uploadFiles.length === 0) {
                  toast({ title: "No files selected", variant: "destructive" });
                  return;
                }
                setUploading(true);
                try {
                  for (const file of uploadFiles) {
                    const intent = await prepareUpload({
                      mediaType: "photo",
                      clientFilename: file.name,
                      mimeType: file.type || "image/jpeg",
                      sizeBytes: file.size,
                      caption: uploadCaption.trim() || undefined,
                      taskId: task.id,
                      isFinal: false,
                    });
                    await uploadBytes(intent.bucket, intent.objectPath, file);
                    await finalizeUpload(intent.uploadIntentId, { taskId: task.id, isFinal: false });
                  }
                  setUploadOpen(false);
                  setUploadCaption("");
                  setUploadFiles([]);
                  toast({ title: "Photo uploaded" });
                } catch (error) {
                  toast({
                    title: "Upload failed",
                    description: error instanceof Error ? error.message : "Unable to upload media.",
                    variant: "destructive",
                  });
                } finally {
                  setUploading(false);
                }
              }}
            >
              {uploading ? "Uploading..." : "Add"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingChecklist} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingChecklist(null); }}>
        <AlertDialogContent className="bg-card border border-border shadow-xl rounded-modal z-[80]">
          <AlertDialogHeader>
            <AlertDialogTitle>Review before completing</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const linked = task.checklist.find((i) => i.id === pendingChecklist?.itemId);
                const linkedType = getChecklistResourceType(linked ?? {
                  id: "",
                  text: "",
                  done: false,
                });
                if (linkedType === "material" || linkedType === "tool") {
                  return "This item is linked to procurement and may still need ordering or receiving. You can still mark it complete if the work is verified on site.";
                }
                if (linkedType === "labor" || linkedType === "subcontractor") {
                  return "This item is linked to HR and may still have pending assignments or payouts. You can still mark it complete if the work is verified.";
                }
                return "Please review linked data before marking this checklist item complete.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-xs text-muted-foreground">
            <button
              type="button"
              className="underline text-destructive"
              onClick={() => {
                const linked = task.checklist.find((i) => i.id === pendingChecklist?.itemId);
                const linkedType = getChecklistResourceType(linked ?? {
                  id: "",
                  text: "",
                  done: false,
                });
                if (linkedType === "material" || linkedType === "tool") {
                  navigate(`/project/${task.project_id}/procurement`);
                } else {
                  navigate(`/project/${task.project_id}/hr`);
                }
                setPendingChecklist(null);
                onOpenChange(false);
              }}
            >
              {(() => {
                const linked = task.checklist.find((i) => i.id === pendingChecklist?.itemId);
                const linkedType = getChecklistResourceType(linked ?? {
                  id: "",
                  text: "",
                  done: false,
                });
                return linkedType === "material" || linkedType === "tool"
                  ? "Open Procurement"
                  : "Open HR";
              })()}
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!pendingChecklist) return;
                void toggleChecklistItem(pendingChecklist.itemId, pendingChecklist.nextDone);
                setPendingChecklist(null);
              }}
            >
              Mark as complete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unified Photo Viewer */}
      <PhotoViewer
        photo={viewerPhoto}
        open={!!viewerPhoto}
        onOpenChange={(o) => { if (!o) setViewerPhoto(null); }}
        source="task"
        allPhotos={taskMedia}
      />
    </>
  );
}
