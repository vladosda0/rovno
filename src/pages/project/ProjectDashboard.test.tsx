import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDashboard from "@/pages/project/ProjectDashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  __unsafeResetStoreForTests,
  getEstimate,
  updateEstimateItems,
} from "@/data/store";
import {
  __unsafeResetEstimateV2ForTests,
  createLine,
  getEstimateV2ProjectState,
} from "@/data/estimate-v2-store";
import { getEstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderProjectDashboard(projectId: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0}>
        <MemoryRouter initialEntries={[`/project/${projectId}/dashboard`]}>
          <Routes>
            <Route path="/project/:id/dashboard" element={<ProjectDashboard />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("ProjectDashboard", () => {
  beforeEach(() => {
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
    window.scrollTo = vi.fn();
  });

  it("shows the budget widget for detail viewers", () => {
    renderProjectDashboard("project-1");

    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
  });

  it("reads dashboard budget metrics from estimate-v2 instead of the legacy estimate store", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Dashboard line",
      type: "material",
      qtyMilli: 1_000,
      costUnitCents: 50_000,
    });

    const summary = getEstimateV2FinanceProjectSummary("project-1");
    const legacyEstimate = getEstimate("project-1");
    if (!legacyEstimate?.versions[0] || !summary) {
      throw new Error("Expected seeded dashboard finance data");
    }
    const plannedText = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: summary.currency,
      maximumFractionDigits: 0,
    }).format(summary.plannedBudgetCents / 100);
    const plannedPattern = new RegExp(plannedText.replace(/\s/g, "\\s?"));

    const legacyVersion = legacyEstimate.versions[0];
    updateEstimateItems(
      legacyVersion.id,
      legacyVersion.items.map((item) => ({
        ...item,
        planned_cost: 99_999_999,
        paid_cost: 88_888_888,
      })),
    );

    renderProjectDashboard("project-1");

    expect(screen.getByText(plannedPattern)).toBeInTheDocument();
    expect(screen.queryByText("Urgent unpaid")).not.toBeInTheDocument();
  });

  it("hides the budget widget for non-detail viewers", () => {
    setAuthRole("contractor");

    renderProjectDashboard("project-1");

    expect(screen.queryByRole("heading", { name: "Budget" })).not.toBeInTheDocument();
  });
});
