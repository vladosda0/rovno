import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import type { Task } from "@/types/entities";

const toastMock = vi.fn();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/use-documents-media-source", () => ({
  useMediaUploadMutations: () => ({
    prepareUpload: vi.fn(),
    uploadBytes: vi.fn(),
    finalizeUpload: vi.fn(),
  }),
}));

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
});
