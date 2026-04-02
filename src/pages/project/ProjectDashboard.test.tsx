import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDashboard from "@/pages/project/ProjectDashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { __unsafeResetStoreForTests } from "@/data/store";
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
    clearDemoSession();
    enterDemoSession("project-1");
    setAuthRole("owner");
    window.scrollTo = vi.fn();
  });

  it("shows the budget widget for detail viewers", () => {
    renderProjectDashboard("project-1");

    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
  });

  it("hides the budget widget for non-detail viewers", () => {
    setAuthRole("contractor");

    renderProjectDashboard("project-1");

    expect(screen.queryByRole("heading", { name: "Budget" })).not.toBeInTheDocument();
  });
});
