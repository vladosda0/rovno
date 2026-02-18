import { useState } from "react";
import { useParams } from "react-router-dom";
import { useProject, useTasks, usePermission } from "@/hooks/use-mock-data";
import { getUserById, getCurrentUser, moveTask, updateTask, addStage, deleteStage as storeDeleteStage, completeStage as storeCompleteStage } from "@/data/store";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TaskDetailDrawer } from "@/components/tasks/TaskDetailDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getAuthRole } from "@/lib/auth-state";
import {
  ListTodo, Plus, GripVertical, CheckCircle2, Circle, Clock,
  AlertTriangle, Trash2, Check, User
} from "lucide-react";
import type { Task, Stage, TaskStatus } from "@/types/entities";

const statusIcon: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: AlertTriangle,
};
const statusColor: Record<string, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  blocked: "text-destructive",
};
const statusLabel: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export default function ProjectTasks() {
  const { id } = useParams<{ id: string }>();
  const { project, stages } = useProject(id!);
  const tasks = useTasks(id!);
  const { role, can: userCan } = usePermission(id!);
  const { toast } = useToast();
  const authRole = getAuthRole();

  // Filter state
  const [assignedToMe, setAssignedToMe] = useState(false);
  const currentUser = getCurrentUser();

  // Task detail
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Stage create modal
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [newStageDesc, setNewStageDesc] = useState("");

  // Stage delete modal
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const deleteStage_ = stages.find((s) => s.id === deleteStageId);
  const deleteTaskCount = deleteStage_ ? tasks.filter((t) => t.stage_id === deleteStage_?.id).length : 0;

  // Stage complete modal
  const [completeStageId, setCompleteStageId] = useState<string | null>(null);
  const completeStage_ = stages.find((s) => s.id === completeStageId);
  const incompleteTasks = completeStage_
    ? tasks.filter((t) => t.stage_id === completeStage_.id && t.status !== "done")
    : [];

  // DnD state
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropStageId, setDropStageId] = useState<string | null>(null);

  const filteredTasks = assignedToMe
    ? tasks.filter((t) => t.assignee_id === currentUser.id)
    : tasks;

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStageId(stageId);
  };

  const handleDragLeave = () => setDropStageId(null);

  const handleDrop = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDropStageId(null);
    if (dragTaskId) {
      moveTask(dragTaskId, stageId);
      toast({ title: "Task moved", description: "Task moved to new stage" });
    }
    setDragTaskId(null);
  };

  const handleCreateStage = () => {
    if (!newStageTitle.trim()) return;
    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      project_id: id!,
      title: newStageTitle.trim(),
      description: newStageDesc.trim(),
      order: stages.length + 1,
      status: "open",
    };
    addStage(newStage);
    setStageModalOpen(false);
    setNewStageTitle("");
    setNewStageDesc("");
    toast({ title: "Stage created", description: newStage.title });
  };

  const handleDeleteStage = () => {
    if (!deleteStageId) return;
    storeDeleteStage(deleteStageId);
    setDeleteStageId(null);
    toast({ title: "Stage deleted" });
  };

  const handleCompleteStage = () => {
    if (!completeStageId) return;
    // Mark incomplete tasks as done
    incompleteTasks.forEach((t) => updateTask(t.id, { status: "done" }));
    storeCompleteStage(completeStageId);
    setCompleteStageId(null);
    toast({ title: "Stage completed" });
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setDrawerOpen(true);
  };

  if (!project) {
    return <EmptyState icon={ListTodo} title="Not found" description="Project not found." />;
  }

  if (stages.length === 0) {
    return (
      <div className="p-sp-3">
        <EmptyState
          icon={ListTodo}
          title="No stages yet"
          description="Create your first stage to organize tasks."
          actionLabel={userCan("task.create") ? "Add Stage" : undefined}
          onAction={userCan("task.create") ? () => setStageModalOpen(true) : undefined}
        />
        {stageModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="glass-modal rounded-modal p-sp-3 w-full max-w-md space-y-sp-2 relative z-10">
              <h3 className="text-h3 text-foreground">Create Stage</h3>
              <p className="text-body-sm text-muted-foreground">Add a new stage to organize tasks.</p>
              <Input placeholder="Stage name" value={newStageTitle} onChange={(e) => setNewStageTitle(e.target.value)} autoFocus />
              <Textarea placeholder="Description (optional)" value={newStageDesc} onChange={(e) => setNewStageDesc(e.target.value)} rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setStageModalOpen(false); setNewStageTitle(""); setNewStageDesc(""); }}>Cancel</Button>
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleCreateStage} disabled={!newStageTitle.trim()}>Create</Button>
              </div>
            </div>
            <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setStageModalOpen(false)} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-sp-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-sp-2 flex-wrap gap-2">
        <h2 className="text-h3 text-foreground">Tasks</h2>
        <div className="flex items-center gap-2">
          {/* Contractor filter chip */}
          {(authRole === "contractor" || role === "contractor") && (
            <button
              onClick={() => setAssignedToMe(!assignedToMe)}
              className={`rounded-pill px-3 py-1 text-caption font-medium transition-colors ${
                assignedToMe
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <User className="h-3 w-3 inline mr-1" />
              Assigned to me
            </button>
          )}
          {userCan("task.create") && (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => setStageModalOpen(true)}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Stage
            </Button>
          )}
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-sp-2 overflow-x-auto pb-sp-2">
        {stages.map((stage) => {
          const stageTasks = filteredTasks.filter((t) => t.stage_id === stage.id);
          const doneTasks = stageTasks.filter((t) => t.status === "done").length;
          const isDropTarget = dropStageId === stage.id;

          return (
            <div
              key={stage.id}
              className={`glass rounded-card p-sp-2 min-w-[280px] w-[300px] flex-shrink-0 flex flex-col transition-colors ${
                isDropTarget ? "ring-2 ring-accent/50" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage header */}
              <div className="flex items-center justify-between mb-sp-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="text-body-sm font-semibold text-foreground truncate">{stage.title}</h3>
                  <span className="text-caption text-muted-foreground">({stageTasks.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <StatusBadge
                    status={stage.status === "completed" ? "Done" : "In progress"}
                    variant="task"
                    className="text-[10px] px-1.5 py-0"
                  />
                  {userCan("task.create") && stage.status !== "completed" && (
                    <>
                      <button
                        onClick={() => setCompleteStageId(stage.id)}
                        className="p-0.5 rounded text-muted-foreground hover:text-success transition-colors"
                        title="Complete stage"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteStageId(stage.id)}
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete stage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress */}
              {stageTasks.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${stageTasks.length > 0 ? (doneTasks / stageTasks.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{doneTasks}/{stageTasks.length}</span>
                </div>
              )}

              {/* Task cards */}
              <div className="space-y-1.5 flex-1">
                {stageTasks.map((task) => {
                  const Icon = statusIcon[task.status] ?? Circle;
                  const color = statusColor[task.status] ?? "text-muted-foreground";
                  const assignee = getUserById(task.assignee_id);
                  const checkDone = task.checklist.filter((c) => c.done).length;

                  return (
                    <div
                      key={task.id}
                      draggable={userCan("task.edit")}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => openTask(task)}
                      className={`glass rounded-panel p-sp-1 px-sp-2 cursor-pointer hover:bg-muted/60 transition-colors ${
                        dragTaskId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {userCan("task.edit") && (
                          <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-grab" />
                        )}
                        <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
                        <span className="text-caption font-medium text-foreground flex-1 truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-5">
                        {assignee && (
                          <div className="h-4 w-4 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-semibold text-accent">{assignee.name.charAt(0)}</span>
                          </div>
                        )}
                        {task.checklist.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ✓ {checkDone}/{task.checklist.length}
                          </span>
                        )}
                        {task.comments.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">💬 {task.comments.length}</span>
                        )}
                        <StatusBadge
                          status={statusLabel[task.status] ?? task.status}
                          variant="task"
                          className="ml-auto text-[10px] px-1.5 py-0"
                        />
                      </div>
                    </div>
                  );
                })}
                {stageTasks.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-sp-2">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedTask(null);
        }}
        canEdit={userCan("task.edit")}
      />

      {/* Stage create modal */}
      {stageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="glass-modal rounded-modal p-sp-3 w-full max-w-md space-y-sp-2 relative z-10">
            <h3 className="text-h3 text-foreground">Create Stage</h3>
            <p className="text-body-sm text-muted-foreground">Add a new stage to organize tasks.</p>
            <Input
              placeholder="Stage name"
              value={newStageTitle}
              onChange={(e) => setNewStageTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Description (optional)"
              value={newStageDesc}
              onChange={(e) => setNewStageDesc(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setStageModalOpen(false); setNewStageTitle(""); setNewStageDesc(""); }}>
                Cancel
              </Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleCreateStage}
                disabled={!newStageTitle.trim()}
              >
                Create
              </Button>
            </div>
          </div>
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setStageModalOpen(false)} />
        </div>
      )}

      {/* Stage delete modal */}
      <ConfirmModal
        open={!!deleteStageId}
        onOpenChange={(open) => { if (!open) setDeleteStageId(null); }}
        title="Delete Stage"
        description={
          deleteTaskCount > 0
            ? `This stage has ${deleteTaskCount} task(s). They will be unassigned. Are you sure?`
            : "Are you sure you want to delete this stage?"
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteStage}
      />

      {/* Stage complete modal */}
      <ConfirmModal
        open={!!completeStageId}
        onOpenChange={(open) => { if (!open) setCompleteStageId(null); }}
        title="Complete Stage"
        description={
          incompleteTasks.length > 0
            ? `${incompleteTasks.length} task(s) are not done yet. They will be marked as done. Continue?`
            : "All tasks are complete. Mark this stage as done?"
        }
        confirmLabel="Complete"
        onConfirm={handleCompleteStage}
      />
    </div>
  );
}
