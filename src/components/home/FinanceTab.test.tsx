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
import { getEstimateV2FinanceSnapshot } from "@/lib/estimate-v2/finance-read-model";
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

describe("FinanceTab", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    __unsafeResetEstimateV2ForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("renders finance totals from estimate-v2 summaries instead of the legacy estimate store", () => {
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

    const expectedBudgetText = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(getEstimateV2FinanceSnapshot([{ id: "project-1", title: "Project One" }]).totals.plannedBudgetCents / 100);
    const expectedBudgetPattern = new RegExp(expectedBudgetText.replace(/\s/g, "\\s?"));
    const inflatedLegacyText = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0,
    }).format(99_999_999);

    const legacyEstimate = getEstimate("project-1");
    if (!legacyEstimate?.versions[0]) {
      throw new Error("Expected seeded legacy estimate version");
    }

    const legacyVersion = legacyEstimate.versions[0];
    updateEstimateItems(
      legacyVersion.id,
      legacyVersion.items.map((item) => ({
        ...item,
        planned_cost: 99_999_999,
        paid_cost: 88_888_888,
      })),
    );

    renderFinanceTab();

    expect(screen.getByText("Budget by Project")).toBeInTheDocument();
    expect(screen.getAllByText(expectedBudgetPattern).length).toBeGreaterThan(0);
    expect(screen.getByText("Apartment Renovation")).toBeInTheDocument();
    expect(screen.queryByText(inflatedLegacyText)).not.toBeInTheDocument();
  });

  it("hides monetary totals for simulated viewer on Home (sensitive-detail gate)", async () => {
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
      expect(screen.queryByText(/Budget:\s/)).not.toBeInTheDocument();
    });
  });
});
