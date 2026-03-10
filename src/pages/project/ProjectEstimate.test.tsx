import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectEstimate from "@/pages/project/ProjectEstimate";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import {
  createLine,
  createStage,
  createWork,
  getEstimateV2ProjectState,
  setProjectEstimateStatus,
} from "@/data/estimate-v2-store";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  enterDemoSession,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

async function flushUi() {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 0);
  });
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function renderProjectEstimate(projectId: string) {
  const queryClient = createQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={[`/project/${projectId}/estimate`]}>
          <Routes>
            <Route path="/project/:id/estimate" element={<ProjectEstimate />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function expectSelection(input: HTMLInputElement, value: string) {
  await flushUi();
  await waitFor(() => {
    expect(input).toHaveFocus();
  });
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(value.length);
}

function setupLocalProject(projectId: string) {
  const profile = setStoredAuthProfile({
    email: `${projectId}@example.com`,
    name: "Owner User",
  });

  addProject({
    id: projectId,
    owner_id: profile.id,
    title: "Workspace Project",
    type: "residential",
    project_mode: "contractor",
    automation_level: "assisted",
    current_stage_id: "",
    progress_pct: 0,
  });

  addMember({
    project_id: projectId,
    user_id: profile.id,
    role: "owner",
    ai_access: "project_pool",
    credit_limit: 500,
    used_credits: 0,
  });
}

function seedEstimateLine(projectId: string) {
  const stage = createStage(projectId, { title: "Shell" });
  expect(stage).not.toBeNull();
  if (!stage) return null;

  const work = createWork(projectId, { stageId: stage.id, title: "Framing" });
  expect(work).not.toBeNull();
  if (!work) return null;

  const line = createLine(projectId, {
    stageId: stage.id,
    workId: work.id,
    title: "Concrete",
    type: "material",
    qtyMilli: 1_000,
    costUnitCents: 12_500,
  });

  expect(line).not.toBeNull();
  return { stage, work, line };
}

describe("ProjectEstimate", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      writable: true,
      value: MouseEvent,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: () => {},
    });

    localStorage.clear();
    sessionStorage.clear();
    clearDemoSession();
    clearStoredAuthProfile();
    setAuthRole("owner");
    __unsafeResetStoreForTests();
  });

  afterEach(() => {
    clearDemoSession();
    clearStoredAuthProfile();
    setAuthRole("owner");
  });

  it("shows the empty estimate intro and immediately edits new stage, work and resource titles", async () => {
    const projectId = "project-estimate-empty-ui";
    setupLocalProject(projectId);

    await act(async () => {
      renderProjectEstimate(projectId);
      await flushUi();
    });

    expect(screen.getByText("No estimate created yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add resource" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create estimate" }));
      await flushUi();
    });

    expect(screen.getByText("No stages yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add stage" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add resource" })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add stage" }));
      await flushUi();
    });

    const stageInput = screen.getByDisplayValue("Add stage") as HTMLInputElement;
    await expectSelection(stageInput, "Add stage");
    await act(async () => {
      fireEvent.change(stageInput, { target: { value: "Shell" } });
      fireEvent.keyDown(stageInput, { key: "Enter" });
      await flushUi();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add work" }));
      await flushUi();
    });

    const workInput = screen.getByDisplayValue("Add work") as HTMLInputElement;
    await expectSelection(workInput, "Add work");
    await act(async () => {
      fireEvent.change(workInput, { target: { value: "Framing" } });
      fireEvent.keyDown(workInput, { key: "Enter" });
      await flushUi();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Framing" })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.pointerDown(screen.getByRole("button", { name: "Add resource" }));
      await flushUi();
    });

    await act(async () => {
      fireEvent.click(await screen.findByRole("menuitem", { name: "Material" }));
      await flushUi();
    });

    const resourceInput = screen.getByDisplayValue("Add resource") as HTMLInputElement;
    await expectSelection(resourceInput, "Add resource");
    expect(screen.getByRole("button", { name: "Add resource" })).not.toHaveFocus();

    expect(screen.queryByText("Stage 1")).not.toBeInTheDocument();
    expect(screen.queryByText("General work")).not.toBeInTheDocument();
  });

  it("opens the estimate immediately when seeded estimate resource lines already exist", async () => {
    const projectId = "project-estimate-seeded-lines";
    setupLocalProject(projectId);
    const seeded = seedEstimateLine(projectId);
    expect(seeded).not.toBeNull();

    await act(async () => {
      renderProjectEstimate(projectId);
      await flushUi();
    });

    expect(screen.queryByText("No estimate created yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shell" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Framing" })).toBeInTheDocument();
  });

  it("keeps the detailed cost overview collapsed by default in work mode", async () => {
    const projectId = "project-estimate-in-work-ui";
    setupLocalProject(projectId);
    const seeded = seedEstimateLine(projectId);
    expect(seeded).not.toBeNull();

    const statusResult = setProjectEstimateStatus(projectId, "in_work", { skipSetup: true });
    expect(statusResult.ok).toBe(true);

    await act(async () => {
      renderProjectEstimate(projectId);
      await flushUi();
    });

    const overviewTrigger = screen.getByRole("button", { name: /Detailed cost overview/i });
    expect(overviewTrigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Financial breakdown")).not.toBeInTheDocument();
    expect(screen.queryByText("Plan vs actual")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(overviewTrigger);
      await flushUi();
    });

    expect(overviewTrigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Financial breakdown")).toBeInTheDocument();
    expect(screen.getByText("Plan vs actual")).toBeInTheDocument();

    const planPanel = screen.getByText("Plan vs actual").closest("div.rounded-md");
    expect(planPanel).not.toBeNull();
    if (!planPanel) return;

    expect(within(planPanel).getByText("Planned")).toBeInTheDocument();
    expect(within(planPanel).getByText("Actual")).toBeInTheDocument();
    expect(within(planPanel).queryByRole("columnheader")).not.toBeInTheDocument();
  });

  it("updates the footer VAT summary totals", async () => {
    const projectId = "project-1";
    enterDemoSession(projectId);

    await act(async () => {
      renderProjectEstimate(projectId);
      await flushUi();
    });

    const footer = screen.getByText("Total across all stages").closest("div.rounded-lg");
    expect(footer).not.toBeNull();
    if (!footer) return;

    const beforeState = getEstimateV2ProjectState(projectId);
    const beforeTotals = computeProjectTotals(
      beforeState.project,
      beforeState.stages,
      beforeState.works,
      beforeState.lines,
      beforeState.project.regime,
    );

    expect(within(footer).getByText("Total across all stages")).toBeInTheDocument();
    expect(normalizeText(footer.textContent)).toContain(normalizeText(formatMoney(beforeTotals.totalCents, beforeState.project.currency)));
    expect(within(footer).getByRole("button", { name: "22%" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(footer).getByRole("button", { name: "22%" }));
      await flushUi();
    });

    const vatInput = within(footer).getByDisplayValue("22") as HTMLInputElement;
    fireEvent.change(vatInput, { target: { value: "18" } });
    fireEvent.keyDown(vatInput, { key: "Enter" });

    const afterState = getEstimateV2ProjectState(projectId);
    const afterTotals = computeProjectTotals(
      afterState.project,
      afterState.stages,
      afterState.works,
      afterState.lines,
      afterState.project.regime,
    );

    expect(afterTotals.totalCents).not.toBe(beforeTotals.totalCents);

    await waitFor(() => {
      expect(within(footer).getByRole("button", { name: "18%" })).toBeInTheDocument();
      expect(normalizeText(footer.textContent)).toContain(normalizeText(formatMoney(afterTotals.totalCents, afterState.project.currency)));
    });
  });
});
