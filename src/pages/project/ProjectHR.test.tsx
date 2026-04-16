import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectHR from "@/pages/project/ProjectHR";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { HRPayment, HRPlannedItem } from "@/types/hr";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";

const navigateMock = vi.fn();

const mocks = vi.hoisted(() => ({
  useEstimateV2Project: vi.fn(),
  useProjectHRMutations: vi.fn(),
  useHRItems: vi.fn(),
  useHRPayments: vi.fn(),
  usePermission: vi.fn(),
  useProject: vi.fn(),
  useTasks: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/hooks/use-estimate-v2-data", () => ({
  useEstimateV2Project: mocks.useEstimateV2Project,
}));

vi.mock("@/hooks/use-hr-source", () => ({
  useProjectHRMutations: mocks.useProjectHRMutations,
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useHRItems: mocks.useHRItems,
  useHRPayments: mocks.useHRPayments,
  usePermission: mocks.usePermission,
  useProject: mocks.useProject,
  useTasks: mocks.useTasks,
}));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");

  interface SelectContextValue {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }

  const SelectContext = React.createContext<SelectContextValue | null>(null);

  function Select({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <SelectContext.Provider value={{ value, onValueChange, disabled }}>
        <div>{children}</div>
      </SelectContext.Provider>
    );
  }

  function SelectTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
    const context = React.useContext(SelectContext);
    return (
      <button
        type="button"
        role="combobox"
        aria-expanded="false"
        disabled={context?.disabled}
        className={className}
      >
        {children}
      </button>
    );
  }

  function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
    const context = React.useContext(SelectContext);
    return <span>{children ?? context?.value ?? placeholder ?? ""}</span>;
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }

  function SelectItem({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children: React.ReactNode;
  }) {
    const context = React.useContext(SelectContext);
    return (
      <button
        type="button"
        role="option"
        aria-selected={context?.value === value}
        disabled={context?.disabled || disabled}
        onClick={() => {
          if (!disabled) {
            context?.onValueChange?.(value);
          }
        }}
      >
        {children}
      </button>
    );
  }

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  };
});

function hrItem(partial: Partial<HRPlannedItem> = {}): HRPlannedItem {
  return {
    id: "hr-item-1",
    projectId: "project-1",
    stageId: "stage-1",
    workId: "work-1",
    taskId: "task-1",
    title: "Painter crew",
    type: "labor",
    plannedQty: 3,
    plannedRate: 1200,
    assignee: null,
    assigneeIds: [],
    status: "planned",
    lockedFromEstimate: false,
    sourceEstimateV2LineId: "line-1",
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    ...partial,
  };
}

function hrPayment(partial: Partial<HRPayment> = {}): HRPayment {
  return {
    id: "payment-1",
    projectId: "project-1",
    hrItemId: "hr-item-1",
    amount: 1000,
    paidAt: "2026-03-01T00:00:00.000Z",
    note: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  };
}

function renderProjectHR(projectId: string) {
  return render(
    <TooltipProvider delayDuration={0}>
      <MemoryRouter initialEntries={[`/project/${projectId}/hr`]}>
        <Routes>
          <Route path="/project/:id/hr" element={<ProjectHR />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

describe("ProjectHR", () => {
  beforeEach(() => {
    clearDemoSession();
    navigateMock.mockReset();
    mocks.useProject.mockReturnValue({
      project: {
        id: "project-1",
        owner_id: "user-1",
        title: "Project One",
        type: "residential",
        project_mode: "contractor",
        automation_level: "manual",
        current_stage_id: "",
        progress_pct: 0,
      },
      members: [
        {
          project_id: "project-1",
          user_id: "user-2",
          role: "owner",
          ai_access: "project_pool",
          credit_limit: 500,
          used_credits: 0,
        },
      ],
    });
    mocks.useEstimateV2Project.mockReturnValue({
      project: {
        id: "project-1",
        estimateStatus: "in_work",
      },
      lines: [
        {
          id: "line-1",
          projectId: "project-1",
          stageId: "stage-1",
          workId: "work-1",
          title: "Painter crew",
          type: "labor",
          unit: "shift",
          qtyMilli: 2000,
          costUnitCents: 150000,
          markupBps: 0,
          discountBpsOverride: null,
          assigneeId: null,
          assigneeName: "Alex Crew",
          assigneeEmail: "alex@example.com",
          receivedCents: 0,
          pnlPlaceholderCents: 0,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
    });
    mocks.useTasks.mockReturnValue([
      {
        id: "task-1",
        project_id: "project-1",
        stage_id: "stage-1",
        title: "Painter task",
        description: "",
        status: "blocked",
        assignee_id: "",
        checklist: [
          {
            id: "check-1",
            text: "Painter crew",
            done: false,
            type: "subtask",
            estimateV2LineId: "line-1",
          },
        ],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ]);
    mocks.useHRItems.mockReturnValue([hrItem()]);
    mocks.useHRPayments.mockReturnValue([hrPayment()]);
    mocks.usePermission.mockReturnValue({
      can: () => true,
      seam: { profileId: "user-1", membership: { role: "owner", finance_visibility: "detail" }, project: null },
    });
    mocks.useProjectHRMutations.mockReturnValue({
      setAssignees: vi.fn(),
      setItemStatus: vi.fn(),
      createPayment: vi.fn(),
    });
  });

  it("removes relink UI and renders task-driven work status with task navigation", () => {
    renderProjectHR("project-1");

    expect(screen.queryByText("Relink")).not.toBeInTheDocument();
    expect(screen.queryByText("Relink to estimate is not yet supported in Supabase mode.")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked status is not yet supported in Supabase mode.")).not.toBeInTheDocument();
    expect(screen.getByText("Work Status")).toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.getByText("Open in Tasks")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Painter crew" })).toBeInTheDocument();

    const row = screen.getByRole("button", { name: "Painter crew" }).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLTableRowElement).getByText("Blocked")).toBeInTheDocument();
    expect(within(row as HTMLTableRowElement).getByText("Alex Crew")).toBeInTheDocument();
    expect(within(row as HTMLTableRowElement).getByText("Locked")).toBeInTheDocument();
    expect(within(row as HTMLTableRowElement).queryByRole("button", { name: "Alex Crew" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Painter crew" }));
    expect(navigateMock).toHaveBeenCalledWith("/project/project-1/tasks", {
      state: { openTaskId: "task-1" },
    });
  });

  it("hides unknown assignees and estimate fallback labels in demo mode", () => {
    enterDemoSession("project-1");
    mocks.useProject.mockReturnValue({
      project: {
        id: "project-1",
        owner_id: "user-1",
        title: "Project One",
        type: "residential",
        project_mode: "contractor",
        automation_level: "manual",
        current_stage_id: "",
        progress_pct: 0,
      },
      members: [
        {
          project_id: "project-1",
          user_id: "user-99",
          role: "owner",
          ai_access: "project_pool",
          credit_limit: 500,
          used_credits: 0,
        },
      ],
    });
    mocks.useHRItems.mockReturnValue([hrItem({ assigneeIds: ["user-99"] })]);

    renderProjectHR("project-1");

    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.queryByText("Alex Crew")).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Alex Crew" })).not.toBeInTheDocument();
  });

  it("shows planning gate and hides task navigation affordances during planning", () => {
    mocks.useEstimateV2Project.mockReturnValue({
      project: {
        id: "project-1",
        estimateStatus: "planning",
      },
      lines: [],
    });

    renderProjectHR("project-1");

    expect(screen.getByText("HR will be ready after planning")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Estimate" })).toBeInTheDocument();
    expect(screen.queryByText("Open in Tasks")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Painter crew" })).not.toBeInTheDocument();
  });

  it("does not recover estimate linkage from task checklist text when source lineage is missing", () => {
    mocks.useHRItems.mockReturnValue([
      hrItem({
        title: "Legacy HR row",
        sourceEstimateV2LineId: null,
      }),
    ]);

    renderProjectHR("project-1");

    expect(screen.getByRole("button", { name: "Legacy HR row" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Painter crew" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.queryByText("Alex Crew")).not.toBeInTheDocument();
  });
});
