import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ShareEstimate from "@/pages/share/ShareEstimate";
import { createVersionSnapshot, setRegimeDev, submitVersion } from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

function renderSharePage(shareId: string) {
  return render(
    <MemoryRouter initialEntries={[`/share/estimate/${shareId}`]}>
      <Routes>
        <Route path="/share/estimate/:shareId" element={<ShareEstimate />} />
      </Routes>
    </MemoryRouter>,
  );
}

function createSubmittedShareVersion(options?: Parameters<typeof submitVersion>[2]): string {
  const projectId = "project-1";
  setAuthRole("owner");
  setRegimeDev(projectId, "contractor");
  const created = createVersionSnapshot(projectId, "user-1");
  const ok = submitVersion(projectId, created.versionId, options);
  expect(ok).toBe(true);
  return created.shareId;
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
    const shareId = createSubmittedShareVersion();
    setAuthRole("guest");

    renderSharePage(shareId);

    expect(screen.getByText("Client estimate view")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register to approve" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("allows registered users to approve when policy is registered", () => {
    const shareId = createSubmittedShareVersion();
    setAuthRole("owner");

    renderSharePage(shareId);

    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("blocks approval when submission policy is preview-only", () => {
    const shareId = createSubmittedShareVersion({
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
});
