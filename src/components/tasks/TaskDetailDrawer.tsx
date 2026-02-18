import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { getUserById, getCurrentUser, updateTask, addComment, updateChecklist } from "@/data/store";
import { useToast } from "@/hooks/use-toast";
import { Send, CheckSquare } from "lucide-react";
import type { Task, TaskStatus, ChecklistItem } from "@/types/entities";

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

export function TaskDetailDrawer({ task, open, onOpenChange, canEdit }: Props) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");

  const handleStatusChange = useCallback((status: TaskStatus) => {
    if (!task) return;
    updateTask(task.id, { status });
    toast({ title: "Task updated", description: `Status changed to ${statusLabel[status]}` });
  }, [task, toast]);

  const handleChecklistToggle = useCallback((itemId: string) => {
    if (!task) return;
    const updated = task.checklist.map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c
    );
    updateChecklist(task.id, updated);
  }, [task]);

  const handleAddComment = useCallback(() => {
    if (!task || !commentText.trim()) return;
    addComment(task.id, commentText.trim());
    setCommentText("");
    toast({ title: "Comment added" });
  }, [task, commentText, toast]);

  if (!task) return null;

  const assignee = getUserById(task.assignee_id);
  const checkDone = task.checklist.filter((c) => c.done).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="glass-modal w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-h3 text-foreground">{task.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-sp-3 mt-sp-3">
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
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
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
            <p className="text-body-sm text-foreground">{task.description}</p>
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

          {/* Checklist */}
          {task.checklist.length > 0 && (
            <div>
              <p className="text-caption text-muted-foreground mb-1 flex items-center gap-1">
                <CheckSquare className="h-3.5 w-3.5" /> Checklist ({checkDone}/{task.checklist.length})
              </p>
              <div className="space-y-1">
                {task.checklist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={item.done}
                      disabled={!canEdit}
                      onCheckedChange={() => handleChecklistToggle(item.id)}
                    />
                    <span className={`text-caption ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="text-caption text-muted-foreground mb-1">Comments ({task.comments.length})</p>
            <div className="space-y-1.5 mb-2">
              {task.comments.map((c) => {
                const author = getUserById(c.author_id);
                return (
                  <div key={c.id} className="glass rounded-panel p-sp-1 px-sp-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-caption font-medium text-foreground">{author?.name ?? "Unknown"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-caption text-foreground">{c.text}</p>
                  </div>
                );
              })}
            </div>
            {canEdit && (
              <div className="flex gap-1.5">
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
