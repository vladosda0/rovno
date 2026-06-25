import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FinanceTab } from "@/components/home/FinanceTab";
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
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderFinanceTab() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FinanceTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FinanceTab portfolio", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("renders the portfolio scorecard, pipeline, and project list from estimate-v2 summaries", () => {
    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Finance line",
      type: "material",
      qtyMilli: 2_000,
      costUnitCents: 125_000,
    });

    // Legacy estimate store inflated — the portfolio must ignore it (estimate-v2 truth).
    const inflatedLegacyText = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(99_999_999);
    const legacyEstimate = getEstimate("project-1");
    if (legacyEstimate?.versions[0]) {
      updateEstimateItems(
        legacyEstimate.versions[0].id,
        legacyEstimate.versions[0].items.map((item) => ({
          ...item,
          planned_cost: 99_999_999,
          paid_cost: 88_888_888,
        })),
      );
    }

    renderFinanceTab();

    // Scorecard + pipeline + list shells are present.
    expect(screen.getByText("Contracts")).toBeInTheDocument();
    expect(screen.getByText("Portfolio margin")).toBeInTheDocument();
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Projects")).toBeInTheDocument();
    // The seeded project appears in the list.
    expect(screen.getByText("Ремонт квартиры")).toBeInTheDocument();
    // The inflated legacy figure never surfaces.
    expect(screen.queryByText(inflatedLegacyText)).not.toBeInTheDocument();
  });

  it("redacts project finance detail for a non-detail viewer (sensitive-detail gate)", async () => {
    setAuthRole("viewer");

    const state = getEstimateV2ProjectState("project-1");
    const work = state.works[0];
    if (!work) {
      throw new Error("Expected seeded estimate-v2 work scaffold");
    }

    createLine("project-1", {
      stageId: work.stageId,
      workId: work.id,
      title: "Viewer finance line",
      type: "material",
      qtyMilli: 2_000,
      costUnitCents: 125_000,
    });

    renderFinanceTab();

    await waitFor(() => {
      expect(screen.getAllByText("Financial details hidden").length).toBeGreaterThan(0);
    });
    // No per-project margin/spend detail leaks for a redacted viewer.
    expect(screen.queryByText(/Margin:\s/)).not.toBeInTheDocument();
  });
});
