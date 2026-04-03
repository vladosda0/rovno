import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ProcurementTab } from "@/components/home/ProcurementTab";
import { __unsafeResetStoreForTests } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderProcurementTab() {
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
        <ProcurementTab />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProcurementTab", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __unsafeResetStoreForTests();
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
  });

  it("shows formatted currency for owner", () => {
    renderProcurementTab();
    expect(screen.getByText("All Procurement")).toBeInTheDocument();
    expect(screen.getAllByText(/₽/).length).toBeGreaterThan(0);
  });

  it("hides price-derived values for simulated viewer", async () => {
    setAuthRole("viewer");
    renderProcurementTab();
    expect(screen.getByText("All Procurement")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryAllByText(/₽/)).toHaveLength(0);
    });
    await waitFor(() => {
      expect(screen.getAllByText((_, el) => (el?.textContent ?? "").includes("·") && (el?.textContent ?? "").includes("—")).length).toBeGreaterThan(0);
    });
  });
});
