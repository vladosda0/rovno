import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import {
  getUserById, getCurrentUser, updateTask, addComment,
  updateChecklist, deleteTask, updateTaskDescription,
  updateTaskDeadline, addChecklistItem, updateChecklistItem,
  deleteChecklistItem,
} from "@/data/store";
import { useToast } from "@/hooks/use-toast";
import {
  Send, CheckSquare, Trash2, Plus, X, Calendar,
} from "lucide-react";
import type { Task, TaskStatus } from "@/types/entities";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

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
  canEdit: boolean;
}

export function TaskDetailModal({ task, open, onOpenChange, canEdit }: Props) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync description draft
  useEffect(() => {
    if (task) setDescDraft(task.description);
  }, [task?.id, task?.description]);

  const handleStatusChange = useCallback((status: TaskStatus) => {
    if (!task) return;
    updateTask(task.id, { status });
    toast({ title: "Status updated", description: statusLabel[status] });
  }, [task, toast]);

  const handleDescBlur = useCallback(() => {
    if (!task) return;
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    if (descDraft !== task.description) {
      updateTaskDescription(task.id, descDraft);
    }
    setEditingDesc(false);
  }, [task, descDraft]);

  const handleDescChange = useCallback((val: string) => {
    setDescDraft(val);
    if (descTimerRef.current) clearTimeout(descTimerRef.current);
    descTimerRef.current = setTimeout(() => {
      if (task) updateTaskDescription(task.id, val);
    }, 800);
  }, [task]);

  const handleChecklistToggle = useCallback((itemId: string) => {
    if (!task) return;
    const updated = task.checklist.map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c
    );
    updateChecklist(task.id, updated);
  }, [task]);

  const handleAddCheckItem = useCallback(() => {
    if (!task || !newCheckItem.trim()) return;
    addChecklistItem(task.id, {
      id: `cl-${Date.now()}`,
      text: newCheckItem.trim(),
      done: false,
    });
    setNewCheckItem("");
  }, [task, newCheckItem]);

  const handleAddComment = useCallback(() => {
    if (!task || !commentText.trim()) return;
    addComment(task.id, commentText.trim());
    setCommentText("");
    toast({ title: "Comment added" });
  }, [task, commentText, toast]);

  const handleDelete = useCallback(() => {
    if (!task) return;
    deleteTask(task.id);
    setDeleteOpen(false);
    onOpenChange(false);
    toast({ title: "Task deleted" });
  }, [task, onOpenChange, toast]);

  const handleDeadlineChange = useCallback((date: Date | undefined) => {
    if (!task) return;
    updateTaskDeadline(task.id, date?.toISOString());
  }, [task]);

  if (!task) return null;

  const assignee = getUserById(task.assignee_id);
  const checkDone = task.checklist.filter((c) => c.done).length;
  const sortedComments = [...task.comments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-modal rounded-modal max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-h3 text-foreground pr-8">{task.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-sp-3">
            {/* Status */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Status</p>
              <div className="flex flex-wrap gap-1.5">
                {statuses.map((s) => (
                  <button
                    key={s}
                    disabled={!canEdit}
                    onClick={() => handleStatusChange(s)}
                    className={`rounded-pill px-2.5 py-0.5 text-caption font-medium transition-colors ${
                      task.status === s
                        ? s === "not_started" ? "bg-muted text-foreground ring-1 ring-border"
                        : s === "in_progress" ? "bg-info/15 text-info ring-1 ring-info/30"
                        : s === "done" ? "bg-success/15 text-success ring-1 ring-success/30"
                        : "bg-destructive/15 text-destructive ring-1 ring-destructive/30"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {statusLabel[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Description — inline editable */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Description</p>
              {editingDesc && canEdit ? (
                <Textarea
                  value={descDraft}
                  onChange={(e) => handleDescChange(e.target.value)}
                  onBlur={handleDescBlur}
                  autoFocus
                  rows={3}
                  className="text-body-sm"
                />
              ) : (
                <p
                  className={`text-body-sm text-foreground whitespace-pre-wrap rounded-panel p-sp-1 px-sp-2 ${
                    canEdit ? "cursor-text hover:bg-muted/40 transition-colors" : ""
                  }`}
                  onClick={() => canEdit && setEditingDesc(true)}
                >
                  {task.description || "Click to add description…"}
                </p>
              )}
            </div>

            {/* Assignee */}
            {assignee && (
              <div>
                <p className="text-caption text-muted-foreground mb-1">Assignee</p>
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-accent">{assignee.name.charAt(0)}</span>
                  </div>
                  <span className="text-body-sm text-foreground">{assignee.name}</span>
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
                {canEdit ? (
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
                {task.checklist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2 group"
                  >
                    <Checkbox
                      checked={item.done}
                      disabled={!canEdit}
                      onCheckedChange={() => handleChecklistToggle(item.id)}
                    />
                    <span className={`text-caption flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item.text}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => deleteChecklistItem(task.id, item.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
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

            {/* Comments — newest first */}
            <div>
              <p className="text-caption text-muted-foreground mb-1">Comments ({task.comments.length})</p>
              {canEdit && (
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
                    <div key={c.id} className="glass rounded-panel p-sp-1 px-sp-2">
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

            {/* Delete */}
            {canEdit && (
              <div className="pt-sp-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete task
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete task?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
