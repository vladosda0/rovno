import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ShareEstimate from "@/pages/share/ShareEstimate";
import {
  createLine,
  createVersionSnapshot,
  getEstimateV2ProjectState,
  submitVersion,
  updateEstimateV2Project,
} from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

let shareScenarioCounter = 0;

function renderSharePage(shareId: string) {
  return render(
    <MemoryRouter initialEntries={[`/share/estimate/${shareId}`]}>
      <Routes>
        <Route path="/share/estimate/:shareId" element={<ShareEstimate />} />
      </Routes>
    </MemoryRouter>,
  );
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function createSubmittedShareVersion(
  projectMode: "contractor" | "build_myself" = "contractor",
  options?: Parameters<typeof submitVersion>[2],
): { shareId: string; lineTitle: string; expectedClientTotal: string } {
  const projectId = "project-1";
  setAuthRole("owner");
  updateEstimateV2Project(projectId, { projectMode });
  const state = getEstimateV2ProjectState(projectId);
  const stage = state.stages[0];
  const work = state.works[0];
  expect(stage).toBeDefined();
  expect(work).toBeDefined();
  if (!stage || !work) {
    throw new Error("Missing seeded stage/work for share estimate test");
  }
  shareScenarioCounter += 1;
  const lineTitle = `Mode-sensitive line (${projectMode}) #${shareScenarioCounter}`;
  const line = createLine(projectId, {
    stageId: stage.id,
    workId: work.id,
    title: lineTitle,
    type: "material",
    unit: "service",
    qtyMilli: 1_000,
    costUnitCents: 10_000,
    markupBps: 2_000,
    discountBpsOverride: 500,
  });
  expect(line).toBeTruthy();
  const created = createVersionSnapshot(projectId, "user-1");
  const ok = submitVersion(projectId, created.versionId, options);
  expect(ok).toBe(true);
  return {
    shareId: created.shareId,
    lineTitle,
    expectedClientTotal: money(projectMode === "contractor" ? 11_400 : 9_500, "RUB"),
  };
}

beforeEach(() => {
  clearDemoSession();
  enterDemoSession("project-1");
  setAuthRole("owner");
});

describe("ShareEstimate approval access", () => {
  afterEach(() => {
    clearDemoSession();
    setAuthRole("owner");
  });

  it("shows register prompt for guests while keeping preview visible", () => {
    const { shareId } = createSubmittedShareVersion();
    setAuthRole("guest");

    renderSharePage(shareId);

    expect(screen.getByText("Estimate preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register to approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("allows registered users to approve when policy is registered", () => {
    const { shareId } = createSubmittedShareVersion("contractor");
    setAuthRole("owner");

    renderSharePage(shareId);

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("blocks approval when submission policy is preview-only", () => {
    const { shareId } = createSubmittedShareVersion("contractor", {
      shareApprovalPolicy: "disabled",
      shareApprovalDisabledReason: "no_participant_slot",
    });
    setAuthRole("owner");

    renderSharePage(shareId);

    expect(
      screen.getByText("Approval is unavailable until project owner upgrades plan and adds client as participant."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("uses contractor project mode for shared estimate pricing", () => {
    const { shareId, lineTitle, expectedClientTotal } = createSubmittedShareVersion("contractor");

    renderSharePage(shareId);

    const row = screen.getByText(lineTitle).closest("tr");
    expect(row).not.toBeNull();
    expect(row?.textContent?.replace(/\s/g, "")).toContain(expectedClientTotal.replace(/\s/g, ""));
  });

  it("uses build_myself project mode for shared estimate pricing while keeping discounts", () => {
    const { shareId, lineTitle, expectedClientTotal } = createSubmittedShareVersion("build_myself");

    renderSharePage(shareId);

    const row = screen.getByText(lineTitle).closest("tr");
    expect(row).not.toBeNull();
    expect(row?.textContent?.replace(/\s/g, "")).toContain(expectedClientTotal.replace(/\s/g, ""));
  });
});
