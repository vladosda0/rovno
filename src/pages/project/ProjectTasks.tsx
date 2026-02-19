import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useProject, useTasks, usePermission } from "@/hooks/use-mock-data";
import {
  getUserById, getCurrentUser, updateTask, addTask, addStage,
  deleteStage as storeDeleteStage, completeStage as storeCompleteStage,
} from "@/data/store";
import { allUsers } from "@/data/seed";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { getAuthRole } from "@/lib/auth-state";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ListTodo, Plus, CheckCircle2, Circle, Clock,
  AlertTriangle, Trash2, Check, User, Calendar as CalendarIcon, GripVertical,
} from "lucide-react";
import type { Task, Stage, TaskStatus } from "@/types/entities";

const statusMeta: Record<TaskStatus, { label: string; Icon: typeof Circle; colorClass: string; bgClass: string }> = {
  not_started: { label: "Not started", Icon: Circle, colorClass: "text-muted-foreground", bgClass: "bg-muted" },
  in_progress: { label: "In progress", Icon: Clock, colorClass: "text-info", bgClass: "bg-info/15" },
  done: { label: "Done", Icon: CheckCircle2, colorClass: "text-success", bgClass: "bg-success/15" },
  blocked: { label: "Blocked", Icon: AlertTriangle, colorClass: "text-destructive", bgClass: "bg-destructive/15" },
};

const allStatuses: TaskStatus[] = ["not_started", "in_progress", "done", "blocked"];

export default function ProjectTasks() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { project, stages, members } = useProject(pid);
  const tasks = useTasks(pid);
  const { role, can: userCan } = usePermission(pid);
  const { toast } = useToast();
  const authRole = getAuthRole();
  const currentUser = getCurrentUser();

  // Active stage tab: "all" or a stage id
  const [activeTab, setActiveTab] = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);

  // Task detail modal
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // New stage modal
  const [stageModalOpen, setStageModalOpen] = useState(false);
  const [newStageTitle, setNewStageTitle] = useState("");
  const [newStageDesc, setNewStageDesc] = useState("");
  const [createWithAI, setCreateWithAI] = useState(false);

  // New task modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("not_started");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskStageId, setTaskStageId] = useState("");
  const [taskDeadline, setTaskDeadline] = useState<Date | undefined>();

  // Stage delete/complete
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const [completeStageId, setCompleteStageId] = useState<string | null>(null);

  // DnD
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);

  // Derived
  const deleteStage_ = stages.find((s) => s.id === deleteStageId);
  const deleteTaskCount = deleteStage_ ? tasks.filter((t) => t.stage_id === deleteStage_?.id).length : 0;
  const completeStage_ = stages.find((s) => s.id === completeStageId);
  const incompleteTasks = completeStage_
    ? tasks.filter((t) => t.stage_id === completeStage_.id && t.status !== "done")
    : [];

  // Filter tasks
  let filteredTasks = activeTab === "all" ? tasks : tasks.filter((t) => t.stage_id === activeTab);
  if (assignedToMe) filteredTasks = filteredTasks.filter((t) => t.assignee_id === currentUser.id);

  const getColumnTasks = (status: TaskStatus) => filteredTasks.filter((t) => t.status === status);

  // --- Handlers ---
  const openNewTask = useCallback((prefillStatus?: TaskStatus) => {
    setTaskTitle("");
    setTaskDesc("");
    setTaskStatus(prefillStatus ?? "not_started");
    setTaskAssignee("");
    setTaskDeadline(undefined);
    setTaskStageId(activeTab !== "all" ? activeTab : (stages[0]?.id ?? ""));
    setTaskModalOpen(true);
  }, [activeTab, stages]);

  const handleCreateTask = useCallback(() => {
    if (!taskTitle.trim()) return;
    const task: Task = {
      id: `task-${Date.now()}`,
      project_id: pid,
      stage_id: taskStageId || stages[0]?.id || "",
      title: taskTitle.trim(),
      description: taskDesc.trim(),
      status: taskStatus,
      assignee_id: taskAssignee || currentUser.id,
      checklist: [],
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: new Date().toISOString(),
      deadline: taskDeadline?.toISOString(),
    };
    addTask(task);
    setTaskModalOpen(false);
    toast({ title: "Task created", description: task.title });
  }, [pid, taskTitle, taskDesc, taskStatus, taskAssignee, taskStageId, taskDeadline, stages, currentUser, toast]);

  const handleCreateStage = useCallback(() => {
    if (!newStageTitle.trim()) return;
    const stageId = `stage-${Date.now()}`;
    const newStage: Stage = {
      id: stageId,
      project_id: pid,
      title: newStageTitle.trim(),
      description: newStageDesc.trim(),
      order: stages.length + 1,
      status: "open",
    };
    addStage(newStage);

    // If AI + description, generate some placeholder tasks
    if (createWithAI && newStageDesc.trim()) {
      const aiTasks = [
        `Prepare ${newStageTitle.trim()} workspace`,
        `Execute main ${newStageTitle.trim()} work`,
        `QA check for ${newStageTitle.trim()}`,
      ];
      aiTasks.forEach((title, i) => {
        addTask({
          id: `task-ai-${Date.now()}-${i}`,
          project_id: pid,
          stage_id: stageId,
          title,
          description: `Auto-generated from: ${newStageDesc.trim()}`,
          status: "not_started",
          assignee_id: currentUser.id,
          checklist: [],
          comments: [],
          attachments: [],
          photos: [],
          linked_estimate_item_ids: [],
          created_at: new Date().toISOString(),
        });
      });
    }

    setStageModalOpen(false);
    setNewStageTitle("");
    setNewStageDesc("");
    setCreateWithAI(false);
    setActiveTab(stageId);
    toast({ title: "Stage created", description: newStage.title });
  }, [pid, newStageTitle, newStageDesc, createWithAI, stages, currentUser, toast]);

  const handleDeleteStage = useCallback(() => {
    if (!deleteStageId) return;
    storeDeleteStage(deleteStageId);
    if (activeTab === deleteStageId) setActiveTab("all");
    setDeleteStageId(null);
    toast({ title: "Stage deleted" });
  }, [deleteStageId, activeTab, toast]);

  const handleCompleteStage = useCallback(() => {
    if (!completeStageId) return;
    incompleteTasks.forEach((t) => updateTask(t.id, { status: "done" }));
    storeCompleteStage(completeStageId);
    setCompleteStageId(null);
    toast({ title: "Stage completed" });
  }, [completeStageId, incompleteTasks, toast]);

  // DnD handlers for status columns
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    setDragTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropStatus(status);
  };
  const handleDragLeave = () => setDropStatus(null);
  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDropStatus(null);
    if (dragTaskId) {
      updateTask(dragTaskId, { status });
      toast({ title: "Task moved", description: statusMeta[status].label });
    }
    setDragTaskId(null);
  };

  if (!project) {
    return <EmptyState icon={ListTodo} title="Not found" description="Project not found." />;
  }

  return (
    <div className="p-sp-2 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-sp-2 flex-wrap gap-2">
        <h2 className="text-h3 text-foreground">Tasks</h2>
        <div className="flex items-center gap-2">
          {(authRole === "contractor" || role === "contractor") && (
            <button
              onClick={() => setAssignedToMe(!assignedToMe)}
              className={`rounded-pill px-3 py-1 text-caption font-medium transition-colors ${
                assignedToMe ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <User className="h-3 w-3 inline mr-1" /> Assigned to me
            </button>
          )}
          {userCan("task.create") && (
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={() => openNewTask()}
            >
              <Plus className="mr-1 h-4 w-4" /> New task
            </Button>
          )}
        </div>
      </div>

      {/* Stage Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-sp-1 mb-sp-2 shrink-0">
        {/* All tab */}
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-pill px-3 py-1.5 text-caption font-medium whitespace-nowrap transition-colors ${
            activeTab === "all" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
        </button>
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setActiveTab(stage.id)}
            className={`rounded-pill px-3 py-1.5 text-caption font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === stage.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {stage.title}
            {stage.status === "completed" && <Check className="h-3 w-3" />}
          </button>
        ))}
        {userCan("task.create") && (
          <button
            onClick={() => setStageModalOpen(true)}
            className="rounded-pill px-3 py-1.5 text-caption font-medium whitespace-nowrap text-muted-foreground hover:bg-muted/80 transition-colors border border-dashed border-border"
          >
            <Plus className="h-3 w-3 inline mr-0.5" /> New stage
          </button>
        )}
      </div>

      {/* Stage actions (when a specific stage is selected) */}
      {activeTab !== "all" && userCan("task.create") && (() => {
        const stage = stages.find((s) => s.id === activeTab);
        if (!stage || stage.status === "completed") return null;
        return (
          <div className="flex gap-1.5 mb-sp-2">
            <Button variant="outline" size="sm" className="h-7 text-caption" onClick={() => setCompleteStageId(stage.id)}>
              <Check className="h-3 w-3 mr-1" /> Complete stage
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-caption text-destructive hover:bg-destructive/10" onClick={() => setDeleteStageId(stage.id)}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        );
      })()}

      {/* Kanban columns by status */}
      <div className="flex gap-sp-2 overflow-x-auto pb-sp-2 flex-1 min-h-0">
        {allStatuses.map((status) => {
          const meta = statusMeta[status];
          const columnTasks = getColumnTasks(status);
          const isDropTarget = dropStatus === status;

          return (
            <div
              key={status}
              className={`glass rounded-card p-sp-2 min-w-[260px] w-[280px] flex-shrink-0 flex flex-col transition-colors ${
                isDropTarget ? "ring-2 ring-accent/50" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-sp-2">
                <div className="flex items-center gap-1.5">
                  <meta.Icon className={`h-4 w-4 ${meta.colorClass}`} />
                  <span className="text-body-sm font-semibold text-foreground">{meta.label}</span>
                  <span className="text-caption text-muted-foreground">({columnTasks.length})</span>
                </div>
                {userCan("task.create") && (
                  <button
                    onClick={() => openNewTask(status)}
                    className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Task cards */}
              <div className="space-y-1.5 flex-1 overflow-y-auto">
                {columnTasks.map((task) => {
                  const assignee = getUserById(task.assignee_id);
                  const checkDone = task.checklist.filter((c) => c.done).length;

                  return (
                    <div
                      key={task.id}
                      draggable={userCan("task.edit")}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`glass rounded-panel p-sp-1 px-sp-2 cursor-pointer hover:bg-muted/60 transition-colors ${
                        dragTaskId === task.id ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {userCan("task.edit") && (
                          <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-grab" />
                        )}
                        <span className="text-caption font-medium text-foreground flex-1 truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 ml-5 flex-wrap">
                        {assignee && (
                          <div className="h-4 w-4 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-semibold text-accent">{assignee.name.charAt(0)}</span>
                          </div>
                        )}
                        {task.checklist.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">✓ {checkDone}/{task.checklist.length}</span>
                        )}
                        {task.comments.length > 0 && (
                          <span className="text-[10px] text-muted-foreground">💬 {task.comments.length}</span>
                        )}
                        {task.deadline && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <CalendarIcon className="h-2.5 w-2.5" />
                            {format(new Date(task.deadline), "MMM d")}
                          </span>
                        )}
                        {/* Stage badge in All tab */}
                        {activeTab === "all" && (() => {
                          const stage = stages.find((s) => s.id === task.stage_id);
                          return stage ? (
                            <span className="text-[10px] text-muted-foreground bg-muted rounded-pill px-1.5">{stage.title}</span>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  );
                })}
                {columnTasks.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-sp-3">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTaskId}
        onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}
        canEdit={userCan("task.edit")}
      />

      {/* New Task Modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="glass-modal rounded-modal p-sp-3 w-full max-w-md space-y-sp-2 relative z-10">
            <h3 className="text-h3 text-foreground">New Task</h3>
            <Input placeholder="Title *" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} autoFocus />
            <Textarea placeholder="Description" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-caption text-muted-foreground mb-1 block">Status</label>
                <Select value={taskStatus} onValueChange={(v) => setTaskStatus(v as TaskStatus)}>
                  <SelectTrigger className="h-8 text-caption"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusMeta[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-caption text-muted-foreground mb-1 block">Assignee</label>
                <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                  <SelectTrigger className="h-8 text-caption"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => {
                      const u = getUserById(m.user_id);
                      return u ? <SelectItem key={m.user_id} value={m.user_id}>{u.name}</SelectItem> : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stage select (only in All tab) */}
            {activeTab === "all" && stages.length > 0 && (
              <div>
                <label className="text-caption text-muted-foreground mb-1 block">Stage</label>
                <Select value={taskStageId} onValueChange={setTaskStageId}>
                  <SelectTrigger className="h-8 text-caption"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deadline */}
            <div>
              <label className="text-caption text-muted-foreground mb-1 block">Deadline</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-8 text-caption justify-start w-full", !taskDeadline && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-3 w-3 mr-1.5" />
                    {taskDeadline ? format(taskDeadline, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={taskDeadline}
                    onSelect={setTaskDeadline}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex justify-end gap-2 pt-sp-1">
              <Button variant="outline" onClick={() => setTaskModalOpen(false)}>Cancel</Button>
              <Button
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                onClick={handleCreateTask}
                disabled={!taskTitle.trim()}
              >
                Create
              </Button>
            </div>
          </div>
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setTaskModalOpen(false)} />
        </div>
      )}

      {/* New Stage Modal */}
      {stageModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="glass-modal rounded-modal p-sp-3 w-full max-w-md space-y-sp-2 relative z-10">
            <h3 className="text-h3 text-foreground">New Stage</h3>
            <Input
              placeholder="Stage name *"
              value={newStageTitle}
              onChange={(e) => setNewStageTitle(e.target.value)}
              autoFocus
            />
            <Textarea
              placeholder="Describe what tasks this stage usually includes."
              value={newStageDesc}
              onChange={(e) => {
                setNewStageDesc(e.target.value);
                if (e.target.value.trim()) setCreateWithAI(true);
                else setCreateWithAI(false);
              }}
              rows={2}
            />
            <label className="flex items-center gap-2 text-caption text-foreground cursor-pointer">
              <Checkbox
                checked={createWithAI}
                onCheckedChange={(checked) => setCreateWithAI(!!checked)}
                disabled={!newStageDesc.trim()}
              />
              Create with AI
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setStageModalOpen(false); setNewStageTitle(""); setNewStageDesc(""); setCreateWithAI(false); }}>
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
