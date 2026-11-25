import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ProjectReports, SharedReport } from "@/data/client-report-source";

const fetchProjectReports = vi.fn<(projectId: string, reportId?: string | null) => Promise<ProjectReports | null>>();

vi.mock("@/data/client-report-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/client-report-source")>();
  return { ...actual, fetchProjectReports: (projectId: string, reportId?: string | null) => fetchProjectReports(projectId, reportId) };
});

import ProjectReport from "@/pages/project/ProjectReport";

const LIST = [
  { id: "r2", period_start: "2026-10-19T00:00:00Z", period_end: "2026-10-25T20:00:00Z", published_at: "2026-10-26T08:00:00Z" },
  { id: "r1", period_start: "2026-10-12T00:00:00Z", period_end: "2026-10-18T20:00:00Z", published_at: "2026-10-19T08:00:00Z" },
];

function shared(id: string, pdfAllowed: boolean): SharedReport {
  const item = LIST.find((row) => row.id === id)!;
  return {
    report: {
      ...item,
      note: "Плитку ждём в среду",
      body: {
        project_title: "Ленина 42",
        prepared_by: "Иван Петров",
        done: [{ id: "t1", title: "Демонтаж плитки", completed_at: "2026-10-21T10:00:00Z" }],
        in_progress: [],
        next: [],
        progress: null,
        stages: null,
      },
    },
    photos: [],
    reports: LIST,
    pdfAllowed,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/project/:id/reports" element={<ProjectReport />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectReport", () => {
  beforeEach(() => {
    fetchProjectReports.mockReset();
  });

  it("opens the latest report inside the project with a way back to the dashboard", async () => {
    fetchProjectReports.mockResolvedValue({ shared: shared("r2", false), reports: LIST });
    renderAt("/project/project-1/reports");

    expect(await screen.findByText("Демонтаж плитки")).toBeInTheDocument();
    expect(fetchProjectReports).toHaveBeenCalledWith("project-1", null);
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/project/project-1/dashboard");
    expect(screen.getByText("Previous reports")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("an earlier report by its id, with the PDF when the owner's plan allows it", async () => {
    fetchProjectReports.mockResolvedValue({ shared: shared("r1", true), reports: LIST });
    renderAt("/project/project-1/reports?report=r1");

    expect(await screen.findByText("Back to the latest report")).toBeInTheDocument();
    expect(fetchProjectReports).toHaveBeenCalledWith("project-1", "r1");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });

  it("a report that is not in this project: not found, with the in-app explanation", async () => {
    fetchProjectReports.mockResolvedValue(null);
    renderAt("/project/project-1/reports?report=r9");

    expect(await screen.findByText("Report not found")).toBeInTheDocument();
    expect(screen.getByText("This project has no such report. All the project's reports are on the dashboard.")).toBeInTheDocument();
    expect(screen.queryByText("Ask the person who sent it for a new link.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeInTheDocument();
  });

  it("shows the way back to the dashboard while the report loads", () => {
    fetchProjectReports.mockReturnValue(new Promise(() => {}));
    const { container } = renderAt("/project/project-1/reports");

    expect(screen.getByRole("link", { name: "Back to dashboard" })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector(".p-sp-3")).toBeNull();
  });

  it("a project with no reports yet is not found too", async () => {
    fetchProjectReports.mockResolvedValue({ shared: null, reports: [] });
    renderAt("/project/project-1/reports");

    expect(await screen.findByText("Report not found")).toBeInTheDocument();
  });
});
