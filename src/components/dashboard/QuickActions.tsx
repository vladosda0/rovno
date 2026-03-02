import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { allUsers } from "@/data/seed";
import {
  addTask,
  addDocument,
  addMedia,
  addMember,
  addEvent,
  getCurrentUser,
  getUserById,
} from "@/data/store";
import { createEstimateItemForTask } from "@/data/estimate-store";
import { useToast } from "@/hooks/use-toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Check,
  Coins,
  FileText,
  ImagePlus,
  Info,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import { ReceiveOrderPickerModal } from "@/components/procurement/ReceiveOrderPickerModal";
import type { Member, MemberRole, Stage, Task, TaskStatus } from "@/types/entities";

type ModalKey = "task" | "document" | "photo" | "participant" | "credits";

interface Props {
  projectId: string;
  members: Member[];
  stages: Stage[];
  tasks: Task[];
  canCreateTask: boolean;
  canCreateDocument: boolean;
  canManageParticipants: boolean;
}

type TaskChecklistDraft = {
  id: string;
  text: string;
  done: boolean;
};

const TASK_STATUSES: TaskStatus[] = ["not_started", "in_progress", "done", "blocked"];

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const CREDIT_PACKS = [50, 100, 200, 300, 400, 500] as const;
const DASHBOARD_MODAL_CONTENT_CLASS = "bg-card border border-border rounded-xl shadow-xl p-sp-3 w-full max-w-md gap-3 [&>button.absolute]:hidden";
const DASHBOARD_MODAL_OVERLAY_CLASS = "bg-black/40";

export function QuickActions({
  projectId,
  members,
  stages,
  tasks,
  canCreateTask,
  canCreateDocument,
  canManageParticipants,
}: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();

  const [openModal, setOpenModal] = useState<ModalKey | null>(null);
  const [discardModal, setDiscardModal] = useState<ModalKey | null>(null);
  const [receiveOrderOpen, setReceiveOrderOpen] = useState(false);

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskStageId, setTaskStageId] = useState(stages[0]?.id ?? "");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>("not_started");
  const [taskAssignee, setTaskAssignee] = useState(members[0]?.user_id ?? currentUser.id);
  const [taskChecklistInput, setTaskChecklistInput] = useState("");
  const [taskChecklistItems, setTaskChecklistItems] = useState<TaskChecklistDraft[]>([]);

  const [documentMode, setDocumentMode] = useState<"upload" | "manual">("upload");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentAiScan, setDocumentAiScan] = useState(false);
  const [manualDocTitle, setManualDocTitle] = useState("");
  const [manualDocDescription, setManualDocDescription] = useState("");
  const [manualDocAi, setManualDocAi] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoTaskId, setPhotoTaskId] = useState("");
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [photoCreateTask, setPhotoCreateTask] = useState(false);
  const [photoTaskStageId, setPhotoTaskStageId] = useState(stages[0]?.id ?? "");

  const [participantEmail, setParticipantEmail] = useState("");
  const [participantRole, setParticipantRole] = useState<MemberRole>("contractor");
  const [participantCredits, setParticipantCredits] = useState("0");

  const [creditPack, setCreditPack] = useState<string>("100");

  const memberOptions = useMemo(
    () => members.map((member) => ({ member, user: getUserById(member.user_id) })).filter((item) => !!item.user),
    [members],
  );

  const hasDirtyState = (modal: ModalKey) => {
    if (modal === "task") {
      return Boolean(
        taskTitle.trim()
        || taskDescription.trim()
        || taskChecklistItems.length
        || taskStatus !== "not_started"
        || taskStageId !== (stages[0]?.id ?? "")
        || taskAssignee !== (members[0]?.user_id ?? currentUser.id),
      );
    }
    if (modal === "document") {
      return Boolean(
        documentFile
        || documentAiScan
        || manualDocTitle.trim()
        || manualDocDescription.trim()
        || manualDocAi
        || documentMode !== "upload",
      );
    }
    if (modal === "photo") {
      return Boolean(
        photoFile
        || photoDescription.trim()
        || photoTaskId
        || photoCreateTask
        || photoTaskStageId !== (stages[0]?.id ?? ""),
      );
    }
    if (modal === "participant") {
      return Boolean(
        participantEmail.trim()
        || participantRole !== "contractor"
        || participantCredits !== "0",
      );
    }
    return creditPack !== "100";
  };

  const resetTaskForm = () => {
    setTaskTitle("");
    setTaskDescription("");
    setTaskStageId(stages[0]?.id ?? "");
    setTaskStatus("not_started");
    setTaskAssignee(members[0]?.user_id ?? currentUser.id);
    setTaskChecklistInput("");
    setTaskChecklistItems([]);
  };

  const resetDocumentForm = () => {
    setDocumentMode("upload");
    setDocumentFile(null);
    setDocumentAiScan(false);
    setManualDocTitle("");
    setManualDocDescription("");
    setManualDocAi(false);
  };

  const resetPhotoForm = () => {
    setPhotoFile(null);
    setPhotoDescription("");
    setPhotoTaskId("");
    setPhotoCreateTask(false);
    setPhotoTaskStageId(stages[0]?.id ?? "");
    setTaskPickerOpen(false);
  };

  const resetParticipantForm = () => {
    setParticipantEmail("");
    setParticipantRole("contractor");
    setParticipantCredits("0");
  };

  const resetCreditsForm = () => {
    setCreditPack("100");
  };

  const resetModalForm = (modal: ModalKey) => {
    if (modal === "task") resetTaskForm();
    if (modal === "document") resetDocumentForm();
    if (modal === "photo") resetPhotoForm();
    if (modal === "participant") resetParticipantForm();
    if (modal === "credits") resetCreditsForm();
  };

  const requestClose = (modal: ModalKey) => {
    if (hasDirtyState(modal)) {
      setDiscardModal(modal);
      return;
    }
    resetModalForm(modal);
    setOpenModal(null);
  };

  const forceClose = (modal: ModalKey) => {
    resetModalForm(modal);
    setOpenModal(null);
  };

  const handleModalOpenChange = (modal: ModalKey, nextOpen: boolean) => {
    if (nextOpen) {
      setOpenModal(modal);
      return;
    }
    requestClose(modal);
  };

  const handleAddChecklistItem = () => {
    if (!taskChecklistInput.trim()) return;
    setTaskChecklistItems((prev) => [
      ...prev,
      { id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, text: taskChecklistInput.trim(), done: false },
    ]);
    setTaskChecklistInput("");
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) return;
    const taskId = `task-${Date.now()}`;
    const task: Task = {
      id: taskId,
      project_id: projectId,
      stage_id: taskStageId || stages[0]?.id || "",
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      status: taskStatus,
      assignee_id: taskAssignee || currentUser.id,
      checklist: taskChecklistItems.map((item) => ({ id: item.id, text: item.text, done: item.done, type: "subtask" })),
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: new Date().toISOString(),
    };
    addTask(task);
    createEstimateItemForTask(task);
    toast({ title: "Task created", description: task.title });
    forceClose("task");
  };

  const handleCreateDocument = () => {
    if (documentMode === "manual" && !manualDocTitle.trim()) return;
    if (documentMode === "upload" && !documentFile) return;

    const now = new Date().toISOString();
    const id = `doc-${Date.now()}`;
    const manualTitle = manualDocTitle.trim() || "New document";
    const uploadedTitle = documentFile?.name || "Uploaded document";
    const title = documentMode === "manual" ? manualTitle : uploadedTitle;

    addDocument({
      id,
      project_id: projectId,
      type: "specification",
      title,
      origin: documentMode === "manual" ? (manualDocAi ? "ai_generated" : "manual") : "uploaded",
      description: manualDocDescription.trim() || undefined,
      created_at: now,
      file_meta: {
        filename: documentFile?.name || `${manualTitle || "document"}.txt`,
        mime: documentFile?.type || "text/plain",
        size: documentFile?.size ?? manualDocDescription.trim().length,
      },
      ai_flags: {
        aiScan: documentMode === "upload" ? documentAiScan : undefined,
        aiCreate: documentMode === "manual" ? manualDocAi : undefined,
      },
      versions: [{
        id: `dv-${Date.now()}`,
        document_id: id,
        number: 1,
        status: "draft",
        content: documentMode === "manual"
          ? (manualDocDescription.trim() || `Draft generated from "${manualTitle}".`)
          : `Uploaded document placeholder for ${uploadedTitle}.`,
      }],
    });

    addEvent({
      id: `evt-${Date.now()}`,
      project_id: projectId,
      actor_id: currentUser.id,
      type: "document_created",
      object_type: "document",
      object_id: id,
      timestamp: now,
      payload: { title },
    });

    toast({ title: "Document created", description: title });
    forceClose("document");
  };

  const handleCreatePhoto = () => {
    if (!photoFile && !photoDescription.trim()) return;

    // RBAC guard: prevent task creation via photo flow for read-only roles.
    if (photoCreateTask && !canCreateTask) {
      toast({ title: "Not allowed", description: "You don't have permission to create tasks." });
      setPhotoCreateTask(false);
      return;
    }


    let linkedTaskId = photoTaskId || undefined;
    if (photoCreateTask) {
      const taskId = `task-${Date.now()}`;
      const title = photoDescription.trim() || photoFile?.name || "Task from photo";
      const generatedTask: Task = {
        id: taskId,
        project_id: projectId,
        stage_id: photoTaskStageId || stages[0]?.id || "",
        title,
        description: photoDescription.trim(),
        status: "not_started",
        assignee_id: currentUser.id,
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: new Date().toISOString(),
      };
      addTask(generatedTask);
      createEstimateItemForTask(generatedTask);
      linkedTaskId = taskId;
    }

    const mediaId = `media-${Date.now()}`;
    const caption = photoDescription.trim() || photoFile?.name || "Photo";
    addMedia({
      id: mediaId,
      project_id: projectId,
      task_id: linkedTaskId,
      uploader_id: currentUser.id,
      caption,
      description: photoDescription.trim() || undefined,
      is_final: false,
      created_at: new Date().toISOString(),
      file_meta: {
        filename: photoFile?.name || "photo.jpg",
        mime: photoFile?.type || "image/jpeg",
        size: photoFile?.size ?? 0,
      },
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: projectId,
      actor_id: currentUser.id,
      type: "photo_uploaded",
      object_type: "media",
      object_id: mediaId,
      timestamp: new Date().toISOString(),
      payload: { caption },
    });
    toast({ title: "Photo uploaded" });
    forceClose("photo");
  };

  const handleInviteParticipant = () => {
    if (!participantEmail.trim()) return;

    const existingUser = allUsers.find((u) => u.email === participantEmail.trim());
    const candidateUserId = existingUser?.id ?? `user-invite-${Date.now()}`;
    const isAlreadyMember = members.some((member) => member.user_id === candidateUserId);
    if (isAlreadyMember) {
      toast({ title: "Already invited", description: "This user is already a project participant.", variant: "destructive" });
      return;
    }

    addMember({
      project_id: projectId,
      user_id: candidateUserId,
      role: participantRole,
      ai_access: participantRole === "viewer" ? "none" : "consult_only",
      credit_limit: parseInt(participantCredits, 10) || 0,
      used_credits: 0,
    });

    addEvent({
      id: `evt-invite-${Date.now()}`,
      project_id: projectId,
      actor_id: currentUser.id,
      type: "member_added",
      object_type: "member",
      object_id: candidateUserId,
      timestamp: new Date().toISOString(),
      payload: {
        email: participantEmail.trim(),
        role: participantRole,
      },
    });

    toast({ title: "Invitation sent", description: participantEmail.trim() });
    forceClose("participant");
  };

  const handlePurchaseCredits = () => {
    forceClose("credits");
    navigate("/profile/upgrade");
  };

  const selectedTaskTitle = tasks.find((task) => task.id === photoTaskId)?.title;

  return (
    <>
      <div className="glass-elevated rounded-card p-sp-2 flex items-center gap-2 flex-wrap">
        <span className="text-caption text-muted-foreground mr-auto">Quick actions</span>
        <Button size="sm" variant="outline" className="text-caption h-7" disabled={!canCreateTask} onClick={() => setOpenModal("task")}>
          <Plus className="h-3 w-3 mr-1" /> Task
        </Button>
        <Button size="sm" variant="outline" className="text-caption h-7" disabled={!canCreateDocument} onClick={() => setOpenModal("document")}>
          <FileText className="h-3 w-3 mr-1" /> Document
        </Button>
        <Button size="sm" variant="outline" className="text-caption h-7" onClick={() => setOpenModal("photo")}>
          <ImagePlus className="h-3 w-3 mr-1" /> Photo
        </Button>
        <Button size="sm" variant="outline" className="text-caption h-7" onClick={() => setReceiveOrderOpen(true)}>
          Receive order
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="outline"
                className="text-caption h-7"
                disabled={!canManageParticipants}
                onClick={() => setOpenModal("participant")}
              >
                <UserPlus className="h-3 w-3 mr-1" /> Participant
              </Button>
            </span>
          </TooltipTrigger>
          {!canManageParticipants && (
            <TooltipContent>Only owner or co-owner can invite participants</TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="outline"
                className="text-caption h-7"
                disabled={!canManageParticipants}
                onClick={() => setOpenModal("credits")}
              >
                <Coins className="h-3 w-3 mr-1" /> Credits
              </Button>
            </span>
          </TooltipTrigger>
          {!canManageParticipants && (
            <TooltipContent>Only owner or co-owner can grant or purchase credits</TooltipContent>
          )}
        </Tooltip>
      </div>

      <Dialog open={openModal === "task"} onOpenChange={(open) => handleModalOpenChange("task", open)}>
        <DialogContent
          className={DASHBOARD_MODAL_CONTENT_CLASS}
          overlayClassName={DASHBOARD_MODAL_OVERLAY_CLASS}
          onEscapeKeyDown={(event) => {
            if (hasDirtyState("task")) {
              event.preventDefault();
              setDiscardModal("task");
            }
          }}
          onInteractOutside={(event) => {
            if (hasDirtyState("task")) {
              event.preventDefault();
              setDiscardModal("task");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Create task</DialogTitle>
            <DialogDescription>Add a task with checklist items and assignment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Title</label>
              <Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Description</label>
              <Textarea
                value={taskDescription}
                onChange={(event) => setTaskDescription(event.target.value)}
                placeholder="Task description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-body-sm font-medium text-foreground">Stage</label>
                <Select value={taskStageId} onValueChange={setTaskStageId}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-body-sm font-medium text-foreground">Status</label>
                <Select value={taskStatus} onValueChange={(value) => setTaskStatus(value as TaskStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>{TASK_STATUS_LABEL[status]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Assign participant</label>
              <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                <SelectTrigger><SelectValue placeholder="Select participant" /></SelectTrigger>
                <SelectContent>
                  {memberOptions.map(({ member, user }) => (
                    <SelectItem key={member.user_id} value={member.user_id}>{user?.name ?? member.user_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-body-sm font-medium text-foreground">Checklist</label>
              </div>
              <div className="space-y-1.5">
                {taskChecklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-2">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={(checked) => {
                        setTaskChecklistItems((prev) => prev.map((entry) => (
                          entry.id === item.id ? { ...entry, done: !!checked } : entry
                        )));
                      }}
                    />
                    <span className="text-caption text-foreground flex-1 truncate">{item.text}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => setTaskChecklistItems((prev) => prev.filter((entry) => entry.id !== item.id))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Input
                    value={taskChecklistInput}
                    onChange={(event) => setTaskChecklistInput(event.target.value)}
                    placeholder="Add checklist item"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddChecklistItem();
                      }
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={handleAddChecklistItem}>Add</Button>
                </div>
              </div>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" variant="outline" size="sm" disabled>
                    Attach photo
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Add photos after task creation.</TooltipContent>
            </Tooltip>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("task")}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || !taskStageId}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === "document"} onOpenChange={(open) => handleModalOpenChange("document", open)}>
        <DialogContent
          className={DASHBOARD_MODAL_CONTENT_CLASS}
          overlayClassName={DASHBOARD_MODAL_OVERLAY_CLASS}
          onEscapeKeyDown={(event) => {
            if (hasDirtyState("document")) {
              event.preventDefault();
              setDiscardModal("document");
            }
          }}
          onInteractOutside={(event) => {
            if (hasDirtyState("document")) {
              event.preventDefault();
              setDiscardModal("document");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Document</DialogTitle>
            <DialogDescription>Upload a document or create one manually.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex items-center gap-2 rounded-panel bg-muted/40 p-1">
              <Button
                size="sm"
                variant={documentMode === "upload" ? "default" : "ghost"}
                className={documentMode === "upload" ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                onClick={() => setDocumentMode("upload")}
              >
                Upload
              </Button>
              <Button
                size="sm"
                variant={documentMode === "manual" ? "default" : "ghost"}
                className={documentMode === "manual" ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                onClick={() => setDocumentMode("manual")}
              >
                Manual
              </Button>
            </div>

            {documentMode === "upload" ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-body-sm font-medium text-foreground">File</label>
                  <Input
                    type="file"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <label className="flex items-center gap-2 text-body-sm text-foreground">
                  <Checkbox checked={documentAiScan} onCheckedChange={(checked) => setDocumentAiScan(!!checked)} />
                  <span className="inline-flex items-center gap-1">
                    AI scan
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Let AI scan the doc, create tasks, checklists, add media.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-body-sm font-medium text-foreground">Title</label>
                  <Input
                    value={manualDocTitle}
                    onChange={(event) => setManualDocTitle(event.target.value)}
                    placeholder="Document title"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-body-sm font-medium text-foreground">Description</label>
                  <Textarea
                    value={manualDocDescription}
                    onChange={(event) => setManualDocDescription(event.target.value)}
                    placeholder="Describe what this document should include"
                    rows={3}
                  />
                </div>
                <label className="flex items-center gap-2 text-body-sm text-foreground">
                  <Checkbox checked={manualDocAi} onCheckedChange={(checked) => setManualDocAi(!!checked)} />
                  <span className="inline-flex items-center gap-1">
                    Create with AI
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Let AI create a document based on your description.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("document")}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreateDocument}
              disabled={documentMode === "manual" ? !manualDocTitle.trim() : !documentFile}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === "photo"} onOpenChange={(open) => handleModalOpenChange("photo", open)}>
        <DialogContent
          className={DASHBOARD_MODAL_CONTENT_CLASS}
          overlayClassName={DASHBOARD_MODAL_OVERLAY_CLASS}
          onEscapeKeyDown={(event) => {
            if (hasDirtyState("photo")) {
              event.preventDefault();
              setDiscardModal("photo");
            }
          }}
          onInteractOutside={(event) => {
            if (hasDirtyState("photo")) {
              event.preventDefault();
              setDiscardModal("photo");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Photo</DialogTitle>
            <DialogDescription>Upload a photo and optionally link it to a task.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Upload photo</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Comment</label>
              <Textarea
                value={photoDescription}
                onChange={(event) => setPhotoDescription(event.target.value)}
                placeholder="Photo description"
                rows={3}
              />
            </div>

            {!photoCreateTask && (
              <div className="space-y-1">
                <label className="text-body-sm font-medium text-foreground">Attach to task (optional)</label>
                <Popover open={taskPickerOpen} onOpenChange={setTaskPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">{selectedTaskTitle || "Select a task"}</span>
                      <Check className="h-3.5 w-3.5 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[320px]" align="start">
                    <Command>
                      <CommandInput placeholder="Search task..." />
                      <CommandList>
                        <CommandEmpty>No tasks found.</CommandEmpty>
                        <CommandGroup>
                          {tasks.map((task) => (
                            <CommandItem
                              key={task.id}
                              value={task.id}
                              onSelect={() => {
                                setPhotoTaskId(task.id);
                                setTaskPickerOpen(false);
                              }}
                            >
                              <span className="truncate">{task.title}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <label className="flex items-center gap-2 text-body-sm text-foreground">
              <Checkbox checked={photoCreateTask} onCheckedChange={(checked) => setPhotoCreateTask(!!checked)} />
              Create a task
            </label>

            {photoCreateTask && (
              <div className="space-y-1">
                <label className="text-body-sm font-medium text-foreground">Stage</label>
                <Select value={photoTaskStageId} onValueChange={setPhotoTaskStageId}>
                  <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("photo")}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreatePhoto}
              disabled={!photoFile && !photoDescription.trim()}
            >
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === "participant"} onOpenChange={(open) => handleModalOpenChange("participant", open)}>
        <DialogContent
          className={DASHBOARD_MODAL_CONTENT_CLASS}
          overlayClassName={DASHBOARD_MODAL_OVERLAY_CLASS}
          onEscapeKeyDown={(event) => {
            if (hasDirtyState("participant")) {
              event.preventDefault();
              setDiscardModal("participant");
            }
          }}
          onInteractOutside={(event) => {
            if (hasDirtyState("participant")) {
              event.preventDefault();
              setDiscardModal("participant");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Invite participant</DialogTitle>
            <DialogDescription>Send a project invitation with role and credits.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={participantEmail}
                onChange={(event) => setParticipantEmail(event.target.value)}
                placeholder="member@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Role</label>
              <Select value={participantRole} onValueChange={(value) => setParticipantRole(value as MemberRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="co_owner">Co-owner</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Credits grant</label>
              <Input
                type="number"
                value={participantCredits}
                onChange={(event) => setParticipantCredits(event.target.value)}
                min={0}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("participant")}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleInviteParticipant}
              disabled={!participantEmail.trim()}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openModal === "credits"} onOpenChange={(open) => handleModalOpenChange("credits", open)}>
        <DialogContent
          className={DASHBOARD_MODAL_CONTENT_CLASS}
          overlayClassName={DASHBOARD_MODAL_OVERLAY_CLASS}
          onEscapeKeyDown={(event) => {
            if (hasDirtyState("credits")) {
              event.preventDefault();
              setDiscardModal("credits");
            }
          }}
          onInteractOutside={(event) => {
            if (hasDirtyState("credits")) {
              event.preventDefault();
              setDiscardModal("credits");
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Credits</DialogTitle>
            <DialogDescription>Select a credits pack.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Pack</label>
              <Select value={creditPack} onValueChange={setCreditPack}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CREDIT_PACKS.map((pack) => (
                    <SelectItem key={pack} value={String(pack)}>{pack} credits</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("credits")}>Close</Button>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handlePurchaseCredits}>
              Purchase credits
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!discardModal}
        onOpenChange={(open) => !open && setDiscardModal(null)}
        title="Discard changes?"
        description="You have unsaved changes in this dialog."
        confirmLabel="Discard"
        onConfirm={() => {
          if (!discardModal) return;
          forceClose(discardModal);
          setDiscardModal(null);
        }}
        onCancel={() => setDiscardModal(null)}
      />

      <ReceiveOrderPickerModal
        open={receiveOrderOpen}
        onOpenChange={setReceiveOrderOpen}
        projectId={projectId}
      />
    </>
  );
}
