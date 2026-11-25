import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReportsWidget } from "@/components/dashboard/ReportsWidget";
import { reportPath, showsViewerReports } from "@/lib/project-reports";
import type { SharedReportListItem } from "@/data/client-report-source";

function report(id: string, start: string, end: string): SharedReportListItem {
  return { id, period_start: start, period_end: end, published_at: end };
}

const REPORTS = [
  report("r5", "2026-10-19T00:00:00Z", "2026-10-25T20:00:00Z"),
  report("r4", "2026-10-12T00:00:00Z", "2026-10-18T20:00:00Z"),
  report("r3", "2026-10-05T00:00:00Z", "2026-10-11T20:00:00Z"),
  report("r2", "2026-09-28T00:00:00Z", "2026-10-04T20:00:00Z"),
  report("r1", "2026-09-21T00:00:00Z", "2026-09-27T20:00:00Z"),
];

function renderWidget(props: Partial<Parameters<typeof ReportsWidget>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ReportsWidget projectId="project-1" reports={REPORTS} isLoading={false} isError={false} maxItems={4} {...props} />
    </MemoryRouter>,
  );
}

describe("ReportsWidget", () => {
  it("lists up to four reports, latest first, and marks the latest one", () => {
    renderWidget();
    const links = screen.getAllByRole("link").filter((link) => link.textContent?.startsWith("Report for"));
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", "/project/project-1/reports?report=r5");
    expect(links[0]).toHaveTextContent("Latest");
    expect(links[1]).not.toHaveTextContent("Latest");
    expect(screen.queryByRole("link", { name: /Sep 21|21 Sep/ })).not.toBeInTheDocument();
  });

  it("shows two reports when asked for two", () => {
    renderWidget({ maxItems: 2 });
    expect(screen.getAllByRole("link").filter((link) => link.textContent?.startsWith("Report for"))).toHaveLength(2);
  });

  it("the header arrow opens the latest report", () => {
    renderWidget();
    expect(screen.getByRole("link", { name: "Open the latest report" })).toHaveAttribute(
      "href",
      "/project/project-1/reports",
    );
  });

  it("without reports: the empty state and no arrow", () => {
    renderWidget({ reports: [] });
    expect(screen.getByText("No reports yet")).toBeInTheDocument();
    expect(screen.getByText("A published report will appear here.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the latest report" })).not.toBeInTheDocument();
  });

  it("a failed read says so instead of claiming there are no reports", () => {
    renderWidget({ reports: [], isError: true });
    expect(screen.getByText("Could not load the report")).toBeInTheDocument();
    expect(screen.queryByText("No reports yet")).not.toBeInTheDocument();
  });
});

describe("ReportsWidget, two reports for the same period", () => {
  it("tells them apart by the publish day", () => {
    render(
      <MemoryRouter>
        <ReportsWidget
          projectId="project-1"
          reports={[
            { id: "b", period_start: "2026-10-19T00:00:00Z", period_end: "2026-10-25T20:00:00Z", published_at: "2026-10-26T08:00:00Z" },
            { id: "a", period_start: "2026-10-19T00:00:00Z", period_end: "2026-10-25T20:00:00Z", published_at: "2026-10-25T12:00:00Z" },
          ]}
          isLoading={false}
          isError={false}
          maxItems={4}
        />
      </MemoryRouter>,
    );
    const labels = screen.getAllByRole("link").filter((link) => link.textContent?.startsWith("Report for"))
      .map((link) => link.textContent);
    expect(labels).toHaveLength(2);
    const withoutBadge = labels.map((label) => label?.replace("Latest", ""));
    expect(withoutBadge[0]).not.toEqual(withoutBadge[1]);
    expect(withoutBadge.every((label) => label?.includes(" · "))).toBe(true);
  });
});

describe("showsViewerReports", () => {
  it("is the viewer's only, and only with a real backend", () => {
    expect(showsViewerReports("supabase", "viewer")).toBe(true);
    for (const role of ["owner", "co_owner", "contractor", null, undefined]) {
      expect(showsViewerReports("supabase", role)).toBe(false);
    }
    expect(showsViewerReports("demo", "viewer")).toBe(false);
    expect(showsViewerReports("local", "viewer")).toBe(false);
  });
});

describe("reportPath", () => {
  it("encodes the report id", () => {
    expect(reportPath("p", "a b")).toBe("/project/p/reports?report=a%20b");
  });
});
