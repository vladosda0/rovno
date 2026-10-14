import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canOpenClientReport,
  closeClientReportDialog,
  getClientReportDialogProjectId,
  openClientReportDialog,
  seamAllowsClientReport,
  subscribeClientReportDialog,
} from "@/lib/client-report-dialog";
import type { ProjectAuthoritySeam } from "@/lib/permissions";
import type { Member, MemberRole } from "@/types/entities";

function seamFor(role: MemberRole): ProjectAuthoritySeam {
  return {
    projectId: "project-1",
    profileId: "profile-1",
    membership: { project_id: "project-1", user_id: "profile-1", role } as Member,
    project: undefined,
  };
}

describe("client report access", () => {
  it("is for the owner and the co-owner only", () => {
    expect(seamAllowsClientReport(seamFor("owner"))).toBe(true);
    expect(seamAllowsClientReport(seamFor("co_owner"))).toBe(true);
    expect(seamAllowsClientReport(seamFor("contractor"))).toBe(false);
    expect(seamAllowsClientReport(seamFor("viewer"))).toBe(false);
    expect(seamAllowsClientReport(undefined)).toBe(false);
  });

  it("is offered on the real backend only", () => {
    expect(canOpenClientReport(seamFor("owner"), "supabase")).toBe(true);
    expect(canOpenClientReport(seamFor("owner"), "demo")).toBe(false);
    expect(canOpenClientReport(seamFor("owner"), "local")).toBe(false);
    expect(canOpenClientReport(seamFor("contractor"), "supabase")).toBe(false);
  });
});

describe("client report dialog store", () => {
  afterEach(() => closeClientReportDialog());

  it("opens for a project, notifies, and closes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClientReportDialog(listener);

    openClientReportDialog("project-7");
    expect(getClientReportDialogProjectId()).toBe("project-7");
    expect(listener).toHaveBeenCalledTimes(1);

    closeClientReportDialog();
    expect(getClientReportDialogProjectId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    openClientReportDialog("project-8");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores an empty project id", () => {
    openClientReportDialog("");
    expect(getClientReportDialogProjectId()).toBeNull();
  });
});
