import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TaskSummaryWidget } from "@/components/dashboard/TaskSummaryWidget";
import type { Task } from "@/types/entities";

vi.mock("@/data/store", () => ({
  getUserById: () => null,
}));

function buildTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    project_id: "project-1",
    stage_id: "stage-1",
    title,
    description: "",
    status: "in_progress",
    assignee_id: "",
    checklist: [],
    comments: [],
    attachments: [],
    photos: [],
    linked_estimate_item_ids: [],
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  } as Task;
}

/** Stands in for the task board, reporting what the dashboard asked it to open. */
function TasksProbe() {
  const location = useLocation();
  const state = location.state as { openTaskId?: string } | null;
  return <div data-testid="opened-task">{state?.openTaskId ?? "none"}</div>;
}

function renderWidget(tasks: Task[]) {
  return render(
    <MemoryRouter initialEntries={["/project/project-1/dashboard"]}>
      <Routes>
        <Route
          path="/project/:id/dashboard"
          element={<TaskSummaryWidget tasks={tasks} projectId="project-1" />}
        />
        <Route path="/project/:id/tasks" element={<TasksProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TaskSummaryWidget", () => {
  // Quick access is only quick if the entity itself is the target: landing on the
  // board with nothing open means finding the task by hand all over again.
  it("opens the clicked task on the task board", () => {
    renderWidget([
      buildTask("task-1", "Rough electrics"),
      buildTask("task-2", "Tile the bathroom"),
    ]);

    fireEvent.click(screen.getByText("Tile the bathroom"));

    expect(screen.getByTestId("opened-task")).toHaveTextContent("task-2");
  });
});
