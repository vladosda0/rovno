import { useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useProject, useTasks, usePermission, useMedia, useWorkspaceMode } from "@/hooks/use-mock-data";
import {
  getUserById, getCurrentUser, updateTask, addTask,
  deleteStage as storeDeleteStage, completeStage as storeCompleteStage,
} from "@/data/store";
import { getPlanningSource } from "@/data/planning-source";
import { allUsers } from "@/data/seed";
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
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  ListTodo, Plus, CheckCircle2, Circle, Clock,
  AlertTriangle, Trash2, Check, User, Calendar as CalendarIcon, GripVertical, Camera,
} from "lucide-react";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import type { TaskStatus } from "@/types/entities";
import { createEstimateItemForTask } from "@/data/estimate-store";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { useMediaUploadMutations } from "@/hooks/use-documents-media-source";

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
  const media = useMedia(pid);
  const { role, can: userCan } = usePermission(pid);
  const { project: estimateProject } = useEstimateV2Project(pid);
  const workspaceMode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const authRole = getAuthRole();
  const currentUser = getCurrentUser();
  const isClientRegime = estimateProject.regime === "client";
  const canCreateTask = !isClientRegime && userCan("task.create");
  const canEditTask = !isClientRegime && userCan("task.edit");
  const { prepareUpload, uploadBytes, finalizeUpload } = useMediaUploadMutations(pid);

  const location = useLocation();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [assignedToMe, setAssignedToMe] = useState(false);

  // Task detail modal
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // Deep-link: open task from navigation state (e.g. from PhotoViewer)
  useEffect(() => {
    const state = location.state as { openTaskId?: string } | null;
    if (state?.openTaskId) {
      setSelectedTaskId(state.openTaskId);
      // Clear the state so it doesn't re-open on re-render
      window.history.replaceState({}, "");
    }
  }, [location.state]);

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

  // --- Done prompt ---
  const [donePrompt, setDonePrompt] = useState<{ taskId: string } | null>(null);
  const [doneFiles, setDoneFiles] = useState<File[]>([]);
  const [doneUploading, setDoneUploading] = useState(false);
  const [doneComment, setDoneComment] = useState("");

  // --- Blocked prompt ---
  const [blockedPrompt, setBlockedPrompt] = useState<{ taskId: string } | null>(null);
  const [blockedReason, setBlockedReason] = useState("");

  // Derived
  const deleteStage_ = stages.find((s) => s.id === deleteStageId);
  const deleteTaskCount = deleteStage_ ? tasks.filter((t) => t.stage_id === deleteStage_?.id).length : 0;
  const completeStage_ = stages.find((s) => s.id === completeStageId);
  const incompleteTasks = useMemo(
    () => (completeStage_
      ? tasks.filter((t) => t.stage_id === completeStage_.id && t.status !== "done")
      : []),
    [completeStage_, tasks],
  );

  // Filter tasks
  let filteredTasks = activeTab === "all" ? tasks : tasks.filter((t) => t.stage_id === activeTab);
  if (assignedToMe) filteredTasks = filteredTasks.filter((t) => t.assignee_id === currentUser.id);

  const getColumnTasks = (status: TaskStatus) => filteredTasks.filter((t) => t.status === status);
  const invalidateProjectStages = useCallback(async () => {
    if (workspaceMode.kind !== "supabase") return;
    await queryClient.invalidateQueries({
      queryKey: planningQueryKeys.projectStages(workspaceMode.profileId, pid),
    });
  }, [workspaceMode, queryClient, pid]);
  const invalidateProjectTasks = useCallback(async () => {
    if (workspaceMode.kind !== "supabase") return;
    await queryClient.invalidateQueries({
      queryKey: planningQueryKeys.projectTasks(workspaceMode.profileId, pid),
    });
  }, [workspaceMode, queryClient, pid]);

  // --- Central status change handler (intercepts Done / Blocked) ---
  const handleStatusChange = useCallback((taskId: string, newStatus: TaskStatus) => {
    if (!canEditTask) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    if (newStatus === "done") {
      const unresolvedChecklistItems = task.checklist.filter((item) => !item.done);
      if (unresolvedChecklistItems.length > 0) {
        toast({
          title: "Cannot mark as Done",
          description: "All checklist items must be checked or resolved first.",
          variant: "destructive",
        });
        return;
      }
      setBlockedPrompt(null); // close any existing prompt
      setSelectedTaskId(null);
      setDonePrompt({ taskId });
      setDoneFiles([]);
      setDoneComment("");
      return;
    }
    if (newStatus === "blocked") {
      setDonePrompt(null); // close any existing prompt
      setSelectedTaskId(null);
      setBlockedPrompt({ taskId });
      setBlockedReason("");
      return;
    }
    void (async () => {
      try {
        const source = await getPlanningSource(
          workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
        );
        await source.updateProjectTask(taskId, { status: newStatus });
        await invalidateProjectTasks();
        toast({ title: "Status updated", description: statusMeta[newStatus].label });
      } catch (error) {
        toast({
          title: "Status update failed",
          description: error instanceof Error ? error.message : "Unable to update task status.",
          variant: "destructive",
        });
      }
    })();
  }, [canEditTask, tasks, toast, workspaceMode, invalidateProjectTasks]);

  // Confirm Done
  const handleConfirmDone = useCallback(async () => {
    if (!donePrompt) return;

    const task = tasks.find((entry) => entry.id === donePrompt.taskId);
    if (!task) return;
    if (task.checklist.some((item) => !item.done)) {
      toast({
        title: "Cannot mark as Done",
        description: "All checklist items must be checked or resolved first.",
        variant: "destructive",
      });
      return;
    }
    if (doneFiles.length === 0) {
      toast({
        title: "No media uploaded",
        description: "Add at least one final-result photo before confirming Done.",
        variant: "destructive",
      });
      return;
    }

    setDoneUploading(true);
    try {
      for (const file of doneFiles) {
        const intent = await prepareUpload({
          mediaType: "photo",
          clientFilename: file.name,
          mimeType: file.type || "image/jpeg",
          sizeBytes: file.size,
          caption: doneComment.trim() || undefined,
          taskId: donePrompt.taskId,
          isFinal: true,
        });
        await uploadBytes(intent.bucket, intent.objectPath, file);
        await finalizeUpload(intent.uploadIntentId, { taskId: donePrompt.taskId, isFinal: true });
      }

      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      if (doneComment.trim()) {
        const authorId = workspaceMode.kind === "supabase" ? workspaceMode.profileId : currentUser.id;
        await source.createTaskComment(donePrompt.taskId, doneComment.trim(), authorId);
      }
      await source.updateProjectTask(donePrompt.taskId, { status: "done" });
      await invalidateProjectTasks();

      setDonePrompt(null);
      setDoneFiles([]);
      setDoneComment("");
      toast({ title: "Task marked as Done" });
    } catch (error) {
      toast({
        title: "Unable to complete task",
        description: error instanceof Error ? error.message : "Final-result upload failed.",
        variant: "destructive",
      });
    } finally {
      setDoneUploading(false);
    }
  }, [
    donePrompt,
    doneFiles,
    doneComment,
    tasks,
    prepareUpload,
    uploadBytes,
    finalizeUpload,
    workspaceMode,
    invalidateProjectTasks,
    toast,
    currentUser.id,
  ]);

  // Confirm Blocked
  const handleConfirmBlocked = useCallback(async () => {
    if (!blockedPrompt) return;
    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      const authorId = workspaceMode.kind === "supabase" ? workspaceMode.profileId : currentUser.id;
      await source.createTaskComment(blockedPrompt.taskId, `Blocker reason: ${blockedReason.trim()}`, authorId);
      await source.updateProjectTask(blockedPrompt.taskId, { status: "blocked" });
      await invalidateProjectTasks();
      setBlockedPrompt(null);
      setBlockedReason("");
      toast({ title: "Task marked as Blocked" });
    } catch (error) {
      toast({
        title: "Unable to mark task as blocked",
        description: error instanceof Error ? error.message : "Failed to persist blocked status.",
        variant: "destructive",
      });
    }
  }, [blockedPrompt, blockedReason, workspaceMode, currentUser.id, invalidateProjectTasks, toast]);

  const handleChecklistToggle = useCallback(async (
    taskId: string,
    itemId: string,
    done: boolean,
  ) => {
    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      await source.updateTaskChecklistItem(taskId, itemId, { done });
      await invalidateProjectTasks();
    } catch (error) {
      toast({
        title: "Unable to update checklist",
        description: error instanceof Error ? error.message : "Checklist update failed.",
        variant: "destructive",
      });
      throw error;
    }
  }, [workspaceMode, invalidateProjectTasks, toast]);

  const handleAddChecklistItem = useCallback(async (taskId: string, text: string) => {
    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      await source.createTaskChecklistItem(taskId, { text: text.trim(), done: false });
      await invalidateProjectTasks();
    } catch (error) {
      toast({
        title: "Unable to add checklist item",
        description: error instanceof Error ? error.message : "Checklist item was not added.",
        variant: "destructive",
      });
    }
  }, [workspaceMode, invalidateProjectTasks, toast]);

  const handleDeleteChecklistItem = useCallback(async (taskId: string, itemId: string) => {
    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      await source.deleteTaskChecklistItem(taskId, itemId);
      await invalidateProjectTasks();
    } catch (error) {
      toast({
        title: "Unable to delete checklist item",
        description: error instanceof Error ? error.message : "Checklist item was not deleted.",
        variant: "destructive",
      });
    }
  }, [workspaceMode, invalidateProjectTasks, toast]);

  const handleTaskCommentCreate = useCallback(async (taskId: string, body: string) => {
    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      const authorId = workspaceMode.kind === "supabase" ? workspaceMode.profileId : currentUser.id;
      await source.createTaskComment(taskId, body.trim(), authorId);
      await invalidateProjectTasks();
      toast({ title: "Comment added" });
    } catch (error) {
      toast({
        title: "Unable to add comment",
        description: error instanceof Error ? error.message : "Comment was not saved.",
        variant: "destructive",
      });
    }
  }, [workspaceMode, currentUser.id, invalidateProjectTasks, toast]);

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
    void (async () => {
      try {
        const source = await getPlanningSource(
          workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
        );
        const createdTask = await source.createProjectTask({
          projectId: pid,
          stageId: taskStageId || stages[0]?.id || "",
          title: taskTitle.trim(),
          description: taskDesc.trim(),
          status: taskStatus,
          assigneeId: taskAssignee || currentUser.id,
          createdBy: workspaceMode.kind === "supabase" ? workspaceMode.profileId : currentUser.id,
          deadline: taskDeadline?.toISOString(),
        });
        createEstimateItemForTask(createdTask);
        await invalidateProjectTasks();
        setTaskModalOpen(false);
        toast({ title: "Task created", description: createdTask.title });
      } catch (error) {
        toast({
          title: "Task creation failed",
          description: error instanceof Error ? error.message : "Unable to create task.",
          variant: "destructive",
        });
      }
    })();
  }, [
    pid,
    taskTitle,
    taskDesc,
    taskStatus,
    taskAssignee,
    taskStageId,
    taskDeadline,
    stages,
    currentUser,
    toast,
    workspaceMode,
    invalidateProjectTasks,
  ]);

  const handleCreateStage = useCallback(() => {
    if (!newStageTitle.trim()) return;
    void (async () => {
      try {
        const source = await getPlanningSource(
          workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
        );
        const createdStage = await source.createProjectStage({
          projectId: pid,
          title: newStageTitle.trim(),
          description: newStageDesc.trim(),
          order: stages.length + 1,
          status: "open",
        });

        if (createWithAI && newStageDesc.trim()) {
          const aiTasks = [
            `Prepare ${newStageTitle.trim()} workspace`,
            `Execute main ${newStageTitle.trim()} work`,
            `QA check for ${newStageTitle.trim()}`,
          ];
          aiTasks.forEach((title, i) => {
            const aiTask = {
              id: `task-ai-${Date.now()}-${i}`,
              project_id: pid,
              stage_id: createdStage.id,
              title,
              description: `Auto-generated from: ${newStageDesc.trim()}`,
              status: "not_started" as const,
              assignee_id: currentUser.id,
              checklist: [],
              comments: [],
              attachments: [],
              photos: [],
              linked_estimate_item_ids: [],
              created_at: new Date().toISOString(),
            };
            addTask(aiTask);
            createEstimateItemForTask(aiTask);
          });
        }

        trackEvent("project_stage_created", { project_id: pid });
        await invalidateProjectStages();
        setStageModalOpen(false);
        setNewStageTitle("");
        setNewStageDesc("");
        setCreateWithAI(false);
        setActiveTab(createdStage.id);
        toast({ title: "Stage created", description: createdStage.title });
      } catch (error) {
        toast({
          title: "Stage creation failed",
          description: error instanceof Error ? error.message : "Unable to create stage.",
          variant: "destructive",
        });
      }
    })();
  }, [
    pid,
    newStageTitle,
    newStageDesc,
    createWithAI,
    stages,
    currentUser,
    toast,
    workspaceMode,
    invalidateProjectStages,
  ]);

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

  // DnD handlers
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
      handleStatusChange(dragTaskId, status);
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
        <h2 className="text-lg font-semibold text-foreground">Tasks</h2>
        <div className="flex items-center gap-2">
          {(authRole === "contractor" || role === "contractor") && (
            <button
              onClick={() => setAssignedToMe(!assignedToMe)}
              className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                assignedToMe ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <User className="h-3 w-3 inline mr-1" /> Assigned to me
            </button>
          )}
          {canCreateTask && (
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
      {isClientRegime && (
        <p className="mb-2 text-caption text-muted-foreground">Client regime: tasks are read-only.</p>
      )}

      {/* Stage Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-sp-1 mb-sp-2 shrink-0">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-full px-3 py-1.5 text-caption font-medium whitespace-nowrap transition-colors ${
            activeTab === "all" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
        </button>
        {stages.map((stage) => (
          <button
            key={stage.id}
            onClick={() => setActiveTab(stage.id)}
            className={`rounded-full px-3 py-1.5 text-caption font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              activeTab === stage.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {stage.title}
            {stage.status === "completed" && <Check className="h-3 w-3" />}
          </button>
        ))}
        {canCreateTask && (
          <button
            onClick={() => setStageModalOpen(true)}
            className="rounded-full px-3 py-1.5 text-caption font-medium whitespace-nowrap text-muted-foreground hover:bg-muted/80 transition-colors border border-dashed border-border"
          >
            <Plus className="h-3 w-3 inline mr-0.5" /> New stage
          </button>
        )}
      </div>

      {/* Stage actions */}
      {activeTab !== "all" && canCreateTask && (() => {
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

      {/* Kanban columns */}
      <div className="flex gap-sp-2 overflow-x-auto pb-sp-2 flex-1 min-h-0">
        {allStatuses.map((status) => {
          const meta = statusMeta[status];
          const columnTasks = getColumnTasks(status);
          const isDropTarget = dropStatus === status;

          return (
            <div
              key={status}
              className={`bg-muted/30 border border-border rounded-xl p-sp-2 min-w-[260px] w-[280px] flex-shrink-0 flex flex-col transition-colors ${
                isDropTarget ? "ring-2 ring-accent/50 bg-accent/5" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-sp-2">
                <div className="flex items-center gap-1.5">
                  <meta.Icon className={`h-4 w-4 ${meta.colorClass}`} />
                  <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                  <span className="text-caption text-muted-foreground">({columnTasks.length})</span>
                </div>
                {canCreateTask && (
                  <button
                    onClick={() => openNewTask(status)}
                    className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Task cards */}
              <div className="space-y-2 flex-1 overflow-y-auto py-1 px-0.5">
                {columnTasks.map((task) => {
                  const assignee = getUserById(task.assignee_id);
                  const checkDone = task.checklist.filter((c) => c.done).length;
                  const taskPhotos = media.filter((m) => m.task_id === task.id);

                  return (
                    <div
                      key={task.id}
                      draggable={canEditTask}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`bg-card border border-border rounded-lg p-2 px-2.5 cursor-pointer hover:shadow-md transition-all ${
                        dragTaskId === task.id ? "opacity-50" : "shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {canEditTask && (
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
                        {taskPhotos.length > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Camera className="h-2.5 w-2.5" /> {taskPhotos.length}
                          </span>
                        )}
                        {task.deadline && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <CalendarIcon className="h-2.5 w-2.5" />
                            {format(new Date(task.deadline), "MMM d")}
                          </span>
                        )}
                        {activeTab === "all" && (() => {
                          const stage = stages.find((s) => s.id === task.stage_id);
                          return stage ? (
                            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5">{stage.title}</span>
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
        canEdit={canEditTask}
        onStatusChange={handleStatusChange}
        projectMedia={media}
        onChecklistToggle={handleChecklistToggle}
        onChecklistAdd={handleAddChecklistItem}
        onChecklistDelete={handleDeleteChecklistItem}
        onAddComment={handleTaskCommentCreate}
      />

      {/* New Task Modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-sp-3 w-full max-w-md space-y-sp-2 relative z-[52] shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">New Task</h3>
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
          <div className="fixed inset-0 z-[51] bg-black/40" onClick={() => setTaskModalOpen(false)} />
        </div>
      )}

      {/* New Stage Modal */}
      {stageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-sp-3 w-full max-w-md space-y-sp-2 relative z-[52] shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">New Stage</h3>
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
          <div className="fixed inset-0 z-[51] bg-black/40" onClick={() => setStageModalOpen(false)} />
        </div>
      )}

      {/* Done prompt — require photos */}
      {donePrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-sp-3 w-full max-w-md space-y-sp-2 relative z-[62] shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Add final result photos</h3>
            <p className="text-sm text-muted-foreground">Upload at least one photo to confirm completion.</p>

            <div className="space-y-2">
              <Input
                type="file"
                accept="image/*"
                multiple
                disabled={doneUploading}
                onChange={(e) => setDoneFiles(Array.from(e.target.files ?? []))}
              />
              <p className="text-caption text-muted-foreground">
                {doneFiles.length > 0 ? `${doneFiles.length} file(s) selected` : "No files selected"}
              </p>
            </div>

            <div>
              <label className="text-caption text-muted-foreground mb-1 block">Comment (optional)</label>
              <Input
                value={doneComment}
                onChange={(e) => setDoneComment(e.target.value)}
                placeholder="Any notes about completion…"
                className="text-sm h-8"
              />
            </div>

            <div className="flex justify-end gap-2 pt-sp-1">
              <Button variant="outline" onClick={() => setDonePrompt(null)}>Back</Button>
              <Button
                className="bg-success text-success-foreground hover:bg-success/90"
                onClick={() => void handleConfirmDone()}
                disabled={doneUploading || doneFiles.length === 0}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" /> {doneUploading ? "Uploading..." : "Mark Done"}
              </Button>
            </div>
          </div>
          <div className="fixed inset-0 z-[61] bg-black/40" onClick={() => setDonePrompt(null)} />
        </div>
      )}

      {/* Blocked prompt — require comment */}
      {blockedPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-sp-3 w-full max-w-md space-y-sp-2 relative z-[62] shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">Why is this blocked?</h3>
            <p className="text-sm text-muted-foreground">Explain the blocker so the team can resolve it.</p>

            <Textarea
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              placeholder="Describe the reason this task is blocked…"
              rows={3}
              autoFocus
              className="text-sm"
            />

            <div className="flex justify-end gap-2 pt-sp-1">
              <Button variant="outline" onClick={() => setBlockedPrompt(null)}>Cancel</Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void handleConfirmBlocked()}
                disabled={blockedReason.trim().length < 5}
              >
                <AlertTriangle className="h-4 w-4 mr-1" /> Mark Blocked
              </Button>
            </div>
          </div>
          <div className="fixed inset-0 z-[61] bg-black/40" onClick={() => setBlockedPrompt(null)} />
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
