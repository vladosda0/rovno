import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import type { Task } from "@/types/entities";

const toastMock = vi.fn();
const uploadMocks = vi.hoisted(() => ({
  prepareUpload: vi.fn(),
  uploadBytes: vi.fn(),
  finalizeUpload: vi.fn(),
  heic: vi.fn(),
}));

vi.mock("heic2any", () => ({ default: (options: unknown) => uploadMocks.heic(options) }));
vi.mock("browser-image-compression", () => ({ default: async (file: File) => file }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/use-documents-media-source", () => ({
  useMediaUploadMutations: () => ({
    prepareUpload: uploadMocks.prepareUpload,
    uploadBytes: uploadMocks.uploadBytes,
    finalizeUpload: uploadMocks.finalizeUpload,
  }),
  useProjectMediaMutations: () => ({ deleteMedia: vi.fn(), updateMediaCaption: vi.fn() }),
}));

vi.mock("@/lib/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");
  return {
    ...actual,
    usePermission: () => ({
      seam: {
        projectId: "project-1",
        profileId: "user-1",
        membership: {
          project_id: "project-1",
          user_id: "user-1",
          role: "owner" as const,
          ai_access: "consult_only",
          finance_visibility: "detail",
          credit_limit: 0,
          used_credits: 0,
        },
        project: undefined,
      },
      role: "owner" as const,
      can: () => true,
      actionState: () => "enabled" as const,
      isLoading: false,
    }),
  };
});

vi.mock("@/data/store", () => ({
  getUserById: (id: string) => {
    if (id === "user-1") return { id, name: "Crew Lead" };
    if (id === "user-2") return { id, name: "Crew Two" };
    return null;
  },
}));

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    project_id: "project-1",
    stage_id: "stage-1",
    estimateV2WorkId: "work-1",
    title: "Task One",
    description: "Initial description",
    status: "not_started",
    assignee_id: "user-1",
    assignees: [
      { id: "user-1", name: "Crew Lead", email: "lead@example.com" },
      { id: null, name: "Helper", email: "helper@example.com" },
    ],
    checklist: [
      {
        id: "check-1",
        text: "Linked line",
        done: false,
        type: "material",
        estimateV2LineId: "line-1",
      },
    ],
    comments: [],
    attachments: [],
    photos: [],
    linked_estimate_item_ids: [],
    created_at: "2026-03-01T00:00:00.000Z",
    deadline: "2026-03-05T00:00:00.000Z",
    ...partial,
  };
}

function uploadHeicAsPng(before: File[] = []) {
  const header = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
  renderTaskDetail();
  fireEvent.click(screen.getByRole("button", { name: /Add photos/i }));
  const dialog = screen.getByRole("alertdialog");
  const files = [...before, new File([header], "img_3641.png", { type: "image/png" })];
  fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add" }));
}

function renderTaskDetail(props: Partial<ComponentProps<typeof TaskDetailModal>> = {}) {
  return render(
    <MemoryRouter>
      <TaskDetailModal
        task={task()}
        open
        onOpenChange={vi.fn()}
        canManageTask
        canChangeStatus
        canEditChecklist
        canComment
        canUploadMedia
        onTitleChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onDeadlineChange={vi.fn()}
        onChecklistAdd={vi.fn()}
        onChecklistDelete={vi.fn()}
        onChecklistToggle={vi.fn()}
        onAddComment={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("TaskDetailModal", () => {
  afterEach(() => {
    toastMock.mockReset();
  });

  it("locks task structure while still showing multi-assignee data", () => {
    renderTaskDetail({
      taskStructureReadOnly: true,
      onDeleteTask: undefined,
    });

    expect(screen.getByText("Assignees")).toBeInTheDocument();
    expect(screen.getByText("Crew Lead")).toBeInTheDocument();
    expect(screen.getByText("Helper")).toBeInTheDocument();
    expect(screen.queryByTitle("Delete task")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Add item…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set deadline" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Click to add description…")).toBeInTheDocument();
  });

  // The status write takes a server round-trip. Without a pending mark the chip
  // looked untouched for those seconds and the click read as ignored.
  it("marks the status being applied as busy and locks the other statuses", () => {
    const onStatusChange = vi.fn();
    renderTaskDetail({ pendingStatus: "in_progress", onStatusChange });

    const pendingChip = screen.getByRole("button", { name: /In progress/ });
    expect(pendingChip).toHaveAttribute("aria-busy", "true");
    expect(pendingChip).toBeDisabled();
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();

    // aria-pressed держится за ПОДТВЕРЖДЁННЫЙ статус, а не за оптимистичную
    // подсветку. Подсветка обязана забежать вперёд, озвучка — нет: если запись
    // провалится, диктор не должен успеть объявить нажатым то, чего сервер не
    // принял. Без этих двух строк правка aria-pressed на
    // `task.status === s || isPending` оставляла все проверки зелёными.
    expect(pendingChip).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Not started/ }))
      .toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it("leaves the status chips live when nothing is in flight", () => {
    const onStatusChange = vi.fn();
    renderTaskDetail({ onStatusChange });

    const chip = screen.getByRole("button", { name: /In progress/ });
    expect(chip).not.toHaveAttribute("aria-busy", "true");
    fireEvent.click(chip);
    expect(onStatusChange).toHaveBeenCalledWith("task-1", "in_progress");
  });

  it("provides an accessible dialog name and description", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderTaskDetail();

      expect(screen.getByRole("dialog", { name: "Task One" })).toBeInTheDocument();

      const consoleOutput = consoleErrorSpy.mock.calls
        .flat()
        .map((value) => String(value))
        .join("\n");
      expect(consoleOutput).not.toContain("DialogContent requires a DialogTitle");
      expect(consoleOutput).not.toContain("Missing `Description` or `aria-describedby={undefined}`");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("routes title and description edits through callbacks", async () => {
    const onTitleChange = vi.fn().mockResolvedValue(undefined);
    const onDescriptionChange = vi.fn().mockResolvedValue(undefined);

    renderTaskDetail({
      task: task({ estimateV2WorkId: undefined }),
      onTitleChange,
      onDescriptionChange,
    });

    fireEvent.click(screen.getAllByText("Task One")[1]);
    const titleInput = screen.getByDisplayValue("Task One");
    fireEvent.change(titleInput, { target: { value: "Updated task" } });
    fireEvent.blur(titleInput);

    await waitFor(() => {
      expect(onTitleChange).toHaveBeenCalledWith("task-1", "Updated task");
    });

    const description = screen.getByDisplayValue("Initial description");
    fireEvent.change(description, { target: { value: "Updated description" } });
    fireEvent.blur(description);

    await waitFor(() => {
      expect(onDescriptionChange).toHaveBeenCalledWith("task-1", "Updated description");
    });
  });

  it("shows a real type badge for linked checklist items without explicit resource type", () => {
    renderTaskDetail({
      task: task({
        checklist: [
          {
            id: "check-1",
            text: "Linked line",
            done: false,
            type: "subtask",
            estimateV2LineId: "line-1",
          },
        ],
      }),
    });

    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.queryByText("Estimate item")).not.toBeInTheDocument();
  });

  it("exposes which status the task is in to assistive technology", () => {
    renderTaskDetail({ task: task({ status: "in_progress" }) });

    const group = screen.getByRole("group", { name: "Status" });
    expect(within(group).getByRole("button", { name: "In progress", pressed: true })).toBeInTheDocument();

    for (const label of ["Not started", "Done", "Blocked"]) {
      expect(within(group).getByRole("button", { name: label, pressed: false })).toBeInTheDocument();
    }
  });

  it("uploads a HEIC photo typed as PNG as a JPEG", async () => {
    uploadMocks.heic.mockResolvedValue(new Blob(["decoded"], { type: "image/jpeg" }));
    uploadMocks.prepareUpload.mockResolvedValue({ bucket: "media", objectPath: "p/x.jpg", uploadIntentId: "intent-1" });
    uploadMocks.uploadBytes.mockResolvedValue(undefined);
    uploadMocks.finalizeUpload.mockResolvedValue(undefined);
    uploadHeicAsPng();

    await waitFor(() => expect(uploadMocks.finalizeUpload).toHaveBeenCalled());
    expect(uploadMocks.prepareUpload).toHaveBeenCalledWith(
      expect.objectContaining({ clientFilename: "img_3641.jpg", mimeType: "image/jpeg" }),
    );
    expect((uploadMocks.uploadBytes.mock.calls[0][2] as File).type).toBe("image/jpeg");
  });

  it("refuses a HEIC photo it cannot decode and uploads none of the selection", async () => {
    uploadMocks.heic.mockRejectedValue(new Error("ERR_LIBHEIF"));
    uploadMocks.prepareUpload.mockReset();
    uploadHeicAsPng([new File(["ok"], "ok.jpg", { type: "image/jpeg" })]);

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Upload failed", description: "Unable to upload media.", variant: "destructive" }),
      ),
    );
    expect(uploadMocks.prepareUpload).not.toHaveBeenCalled();
  });
});
