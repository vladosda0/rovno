import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addTask,
  addDocument,
  addMedia,
  addEvent,
  getCurrentUser,
  getUserById,
} from "@/data/store";
import { useProjectDocumentMutations, useMediaUploadMutations } from "@/hooks/use-documents-media-source";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/lib/permissions";
import {
  canViewInternalDocuments,
  effectiveInternalDocsVisibilityForSeam,
} from "@/lib/internal-docs-visibility";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  X,
} from "lucide-react";
import { ReceiveOrderPickerModal } from "@/components/procurement/ReceiveOrderPickerModal";
import type { AIAccess, DocMediaVisibilityClass, Member, MemberRole, Stage, Task, TaskStatus } from "@/types/entities";

type ModalKey = "task" | "document" | "photo" | "credits";

interface Props {
  projectId: string;
  projectMode?: "build_myself" | "contractor";
  members: Member[];
  stages: Stage[];
  tasks: Task[];
  canCreateTask: boolean;
  canCreateDocument: boolean;
  canCreatePhoto: boolean;
  canManageProcurement: boolean;
  canManageParticipants: boolean;
  actorRole?: MemberRole;
  actorAiAccess?: AIAccess;
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
  canCreatePhoto,
  canManageProcurement,
  canManageParticipants,
}: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const workspaceMode = useWorkspaceMode();
  const { createDocument } = useProjectDocumentMutations(projectId);
  const {
    prepareUpload: prepareMediaUpload,
    uploadBytes: uploadMediaBytes,
    finalizeUpload: finalizeMediaUpload,
  } = useMediaUploadMutations(projectId);
  const isSupabaseMode = workspaceMode.kind === "supabase";
  const perm = usePermission(projectId);

  const effectiveInternalDocs = useMemo(
    () => effectiveInternalDocsVisibilityForSeam(perm.seam.membership),
    [perm.seam.membership],
  );
  const canSelectInternalUpload = canViewInternalDocuments(effectiveInternalDocs);

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

  const [docVisibilityClass, setDocVisibilityClass] = useState<DocMediaVisibilityClass>("shared_project");

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoTaskId, setPhotoTaskId] = useState("");
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [photoCreateTask, setPhotoCreateTask] = useState(false);
  const [photoTaskStageId, setPhotoTaskStageId] = useState(stages[0]?.id ?? "");
  const [photoVisibilityClass, setPhotoVisibilityClass] = useState<DocMediaVisibilityClass>("shared_project");
  const [photoUploading, setPhotoUploading] = useState(false);

  const [creditPack, setCreditPack] = useState<string>("100");

  useEffect(() => {
    if (!canSelectInternalUpload) {
      if (docVisibilityClass === "internal") setDocVisibilityClass("shared_project");
      if (photoVisibilityClass === "internal") setPhotoVisibilityClass("shared_project");
    }
  }, [canSelectInternalUpload, docVisibilityClass, photoVisibilityClass]);

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
        || documentMode !== "upload"
        || docVisibilityClass !== "shared_project",
      );
    }
    if (modal === "photo") {
      return Boolean(
        photoFile
        || photoDescription.trim()
        || photoTaskId
        || photoCreateTask
        || photoTaskStageId !== (stages[0]?.id ?? "")
        || photoVisibilityClass !== "shared_project",
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
    setDocVisibilityClass("shared_project");
  };

  const resetPhotoForm = () => {
    setPhotoFile(null);
    setPhotoDescription("");
    setPhotoTaskId("");
    setPhotoCreateTask(false);
    setPhotoTaskStageId(stages[0]?.id ?? "");
    setTaskPickerOpen(false);
    setPhotoVisibilityClass("shared_project");
    setPhotoUploading(false);
  };

  const resetCreditsForm = () => {
    setCreditPack("100");
  };

  const resetModalForm = (modal: ModalKey) => {
    if (modal === "task") resetTaskForm();
    if (modal === "document") resetDocumentForm();
    if (modal === "photo") resetPhotoForm();
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
    toast({ title: "Task created", description: task.title });
    forceClose("task");
  };

  const handleCreateDocument = async () => {
    if (documentMode === "manual" && !manualDocTitle.trim()) return;
    if (documentMode === "upload" && !documentFile) return;
    if (isSupabaseMode && documentMode !== "upload") {
      toast({
        title: "Unavailable in Supabase mode",
        description: "Manual and AI-authored document text is not persisted yet in Supabase mode.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    const id = `doc-${Date.now()}`;
    const manualTitle = manualDocTitle.trim() || "New document";
    const uploadedTitle = documentFile?.name || "Uploaded document";
    const title = documentMode === "manual" ? manualTitle : uploadedTitle;

    if (isSupabaseMode) {
      try {
        await createDocument({
          type: "specification",
          title,
          origin: "uploaded",
          initialVersionContent: `Uploaded document placeholder for ${uploadedTitle}.`,
          initialVersionStatus: "draft",
          visibilityClass: docVisibilityClass,
        });

        toast({
          title: "Document created",
          description: "Document metadata saved. File contents are not uploaded yet in Supabase mode.",
        });
        forceClose("document");
      } catch (error) {
        toast({
          title: "Document creation failed",
          description: error instanceof Error ? error.message : "Unable to create the document.",
          variant: "destructive",
        });
      }

      return;
    }

    addDocument({
      id,
      project_id: projectId,
      type: "specification",
      title,
      origin: documentMode === "manual" ? (manualDocAi ? "ai_generated" : "manual") : "uploaded",
      description: manualDocDescription.trim() || undefined,
      created_at: now,
      visibility_class: docVisibilityClass,
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

  const handleCreatePhoto = async () => {
    if (!photoFile && !photoDescription.trim()) return;

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
      linkedTaskId = taskId;
    }

    if (isSupabaseMode) {
      if (!photoFile) {
        toast({ title: "Please select a file", variant: "destructive" });
        return;
      }
      setPhotoUploading(true);
      try {
        const intent = await prepareMediaUpload({
          mediaType: "photo",
          clientFilename: photoFile.name,
          mimeType: photoFile.type || "image/jpeg",
          sizeBytes: photoFile.size,
          caption: photoDescription.trim() || undefined,
          visibilityClass: photoVisibilityClass,
        });
        await uploadMediaBytes(intent.bucket, intent.objectPath, photoFile);
        await finalizeMediaUpload(intent.uploadIntentId);
        toast({ title: "Photo uploaded" });
        forceClose("photo");
      } catch (error) {
        setPhotoUploading(false);
        toast({
          title: "Photo upload failed",
          description: error instanceof Error ? error.message : "Unable to upload the photo.",
          variant: "destructive",
        });
      }
      return;
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
      visibility_class: photoVisibilityClass,
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
        {canCreatePhoto && (
          <Button size="sm" variant="outline" className="text-caption h-7" onClick={() => setOpenModal("photo")}>
            <ImagePlus className="h-3 w-3 mr-1" /> Photo
          </Button>
        )}
        {canManageProcurement && (
          <Button size="sm" variant="outline" className="text-caption h-7" onClick={() => setReceiveOrderOpen(true)}>
            Receive order
          </Button>
        )}

        {canManageParticipants && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-caption h-7"
                  onClick={() => setOpenModal("credits")}
                >
                  <Coins className="h-3 w-3 mr-1" /> Credits
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Only owner or co-owner can grant or purchase credits</TooltipContent>
          </Tooltip>
        )}
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
            <DialogDescription>
              {isSupabaseMode
                ? "Create a document record. File bytes and authored document text are coming soon in Supabase mode."
                : "Upload a document or create one manually."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {!isSupabaseMode && (
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
            )}
            {isSupabaseMode && (
              <div className="rounded-panel bg-muted/50 p-2 text-caption text-muted-foreground">
                Supabase mode saves the document record only. File contents, download, and sharing are coming soon.
              </div>
            )}

            {documentMode === "upload" ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-body-sm font-medium text-foreground">File</label>
                  <Input
                    type="file"
                    onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                {isSupabaseMode ? (
                  <p className="text-caption text-muted-foreground">
                    Choose a file name to create the document record now. The file itself will not upload yet.
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-body-sm text-foreground">
                    <Checkbox
                      checked={documentAiScan}
                      onCheckedChange={(checked) => setDocumentAiScan(!!checked)}
                    />
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
                )}
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
            <div className="space-y-2">
              <Label className="text-body-sm font-medium text-foreground">Visibility</Label>
              <RadioGroup
                value={docVisibilityClass}
                onValueChange={(v) => setDocVisibilityClass(v as DocMediaVisibilityClass)}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="shared_project" id="qa-doc-vis-shared" />
                  <Label htmlFor="qa-doc-vis-shared" className="font-normal cursor-pointer">Shared</Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="internal" id="qa-doc-vis-internal" disabled={!canSelectInternalUpload} />
                  <div>
                    <Label
                      htmlFor="qa-doc-vis-internal"
                      className={`font-normal ${canSelectInternalUpload ? "cursor-pointer" : "text-muted-foreground"}`}
                    >
                      Internal
                    </Label>
                    {!canSelectInternalUpload && (
                      <p className="text-caption text-muted-foreground">Not available for your internal-docs access.</p>
                    )}
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("document")}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreateDocument}
              disabled={documentMode === "manual"
                ? (isSupabaseMode || !manualDocTitle.trim())
                : !documentFile}
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
            <div className="space-y-2">
              <Label className="text-body-sm font-medium text-foreground">Visibility</Label>
              <RadioGroup
                value={photoVisibilityClass}
                onValueChange={(v) => setPhotoVisibilityClass(v as DocMediaVisibilityClass)}
                className="flex flex-col gap-2"
                disabled={photoUploading}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="shared_project" id="qa-photo-vis-shared" />
                  <Label htmlFor="qa-photo-vis-shared" className="font-normal cursor-pointer">Shared</Label>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="internal" id="qa-photo-vis-internal" disabled={!canSelectInternalUpload} />
                  <div>
                    <Label
                      htmlFor="qa-photo-vis-internal"
                      className={`font-normal ${canSelectInternalUpload ? "cursor-pointer" : "text-muted-foreground"}`}
                    >
                      Internal
                    </Label>
                    {!canSelectInternalUpload && (
                      <p className="text-caption text-muted-foreground">Not available for your internal-docs access.</p>
                    )}
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => requestClose("photo")} disabled={photoUploading}>Close</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleCreatePhoto}
              disabled={photoUploading || (isSupabaseMode ? !photoFile : (!photoFile && !photoDescription.trim()))}
            >
              {photoUploading ? "Uploading…" : "Upload"}
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
