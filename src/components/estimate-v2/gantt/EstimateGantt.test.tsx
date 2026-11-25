import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EstimateV2Stage, EstimateV2Work } from "@/types/estimate-v2";

vi.mock("@/data/estimate-v2-store", () => ({
  addDependency: vi.fn(),
  removeDependency: vi.fn(),
  updateWorkDates: vi.fn(() => ({ ok: true, shiftedWorkIds: [] })),
}));

import { EstimateGantt } from "@/components/estimate-v2/gantt/EstimateGantt";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const stage: EstimateV2Stage = {
  id: "s-1",
  projectId: "p-1",
  title: "Shell",
  order: 1,
  discountBps: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as EstimateV2Stage;

function work(id: string, order: number, partial: Partial<EstimateV2Work> = {}): EstimateV2Work {
  return {
    id,
    projectId: "p-1",
    stageId: "s-1",
    title: id,
    order,
    discountBps: 0,
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

const local = (y: number, m: number, d: number) => new Date(y, m - 1, d).toISOString();

describe("EstimateGantt dates (rovno#235)", () => {
  it("says «No planned dates» for a dateless work instead of inventing today", () => {
    render(<EstimateGantt projectId="p-1" stages={[stage]} works={[work("Demolition", 1)]} dependencies={[]} isOwner />);

    expect(screen.getByText("No planned dates")).toBeInTheDocument();
    expect(screen.getByTitle("Drag to set dates")).toBeInTheDocument();
  });

  it("draws picked dates dashed with a caption, and a person's dates as before", () => {
    render(
      <EstimateGantt
        projectId="p-1"
        stages={[stage]}
        works={[
          work("Demolition", 1, { plannedStart: local(2026, 10, 15), plannedEnd: local(2026, 10, 21), datesAutoScheduled: true }),
          work("Plaster", 2, { plannedStart: local(2026, 10, 20), plannedEnd: local(2026, 10, 26) }),
        ]}
        dependencies={[]}
        isOwner
      />,
    );

    expect(screen.getByText("Oct 15 – Oct 21 · picked automatically")).toBeInTheDocument();
    expect(screen.getByText("Oct 20 – Oct 26")).toBeInTheDocument();
    const picked = screen.getByTitle("Demolition. Dates were picked automatically. Drag the bar to set your own.");
    expect(picked).toHaveAttribute("data-auto-scheduled", "true");
    expect(picked.className).toContain("border-dashed");
    const own = screen.getByTitle("Plaster");
    expect(own).not.toHaveAttribute("data-auto-scheduled");
    expect(own.className).not.toContain("border-dashed");
  });

  it("labels the weeks scale with the month and the dates of each week", () => {
    render(
      <EstimateGantt
        projectId="p-1"
        stages={[stage]}
        works={[work("Demolition", 1, { plannedStart: local(2026, 10, 15), plannedEnd: local(2026, 10, 21) })]}
        dependencies={[]}
        isOwner
      />,
    );

    expect(screen.getAllByText("October 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("12–18")).toBeInTheDocument();
    expect(screen.getByText("Oct 26 – Nov 1")).toBeInTheDocument();
    expect(screen.queryByText(/^W\d+$/)).not.toBeInTheDocument();
  });
});
