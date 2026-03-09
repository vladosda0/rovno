import { act, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProjectEstimate from "@/pages/project/ProjectEstimate";
import {
  createLine,
  createWork,
  getEstimateV2ProjectState,
} from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

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

describe("ProjectEstimate", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  afterEach(() => {
    clearDemoSession();
    setAuthRole("owner");
    vi.restoreAllMocks();
  });

  it("keeps the page mounted when the first assignable resource is added to a work", async () => {
    const projectId = "project-1";
    const workTitle = "Regression work without assignee";
    const lineTitle = "Regression labor resource";
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const initialState = getEstimateV2ProjectState(projectId);
    const targetStage = initialState.stages.at(-1);
    expect(targetStage).toBeDefined();
    if (!targetStage) return;

    const createdWork = createWork(projectId, {
      stageId: targetStage.id,
      title: workTitle,
    });
    expect(createdWork).not.toBeNull();
    if (!createdWork) return;

    await act(async () => {
      renderProjectEstimate(projectId);
      await flushUi();
    });

    const initialWorkCard = screen.getByRole("button", { name: workTitle }).closest("div.group\\/work");
    expect(initialWorkCard).not.toBeNull();
    if (!initialWorkCard) return;

    expect(within(initialWorkCard).queryByRole("columnheader", { name: "Assigned" })).not.toBeInTheDocument();

    await act(async () => {
      const createdLine = createLine(projectId, {
        stageId: targetStage.id,
        workId: createdWork.id,
        title: lineTitle,
        type: "labor",
      });

      expect(createdLine).not.toBeNull();
      await flushUi();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: workTitle })).toBeInTheDocument();
      expect(screen.getByText(lineTitle)).toBeInTheDocument();
    });

    const updatedWorkCard = screen.getByRole("button", { name: workTitle }).closest("div.group\\/work");
    expect(updatedWorkCard).not.toBeNull();
    if (!updatedWorkCard) return;

    expect(within(updatedWorkCard).getByRole("columnheader", { name: "Assigned" })).toBeInTheDocument();

    const maxDepthLogged = consoleErrorSpy.mock.calls.some((call) => (
      call.some((value) => typeof value === "string" && value.includes("Maximum update depth exceeded"))
    ));
    expect(maxDepthLogged).toBe(false);
  });

  it("uses project membership instead of the simulated auth role for owner controls", async () => {
    setAuthRole("guest");

    await act(async () => {
      renderProjectEstimate("project-1");
      await flushUi();
    });

    expect(screen.queryByText("Owner only")).not.toBeInTheDocument();
  });
});
