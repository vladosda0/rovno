import { describe, expect, it } from "vitest";
import { resolveOwnerPlanCode, resolveShareApprovalPolicy, type OwnerPlanInput } from "@/lib/estimate-share-approval";
import type { MemberRole } from "@/types/entities";

// rovno#138 (Vlad's decision 2026-09-29, option A): seats come from the owner's
// live subscription (editors_per_project), counted against co_owner and
// contractor rows like the Participants screen.

const m = (role: MemberRole) => ({ role });
const disabled = { shareApprovalPolicy: "disabled", shareApprovalDisabledReason: "no_participant_slot" };
const registered = { shareApprovalPolicy: "registered" };

describe("resolveShareApprovalPolicy", () => {
  it("lets the client approve on brigade with the owner and one member", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "brigade", members: [m("owner"), m("contractor")] })).toEqual(registered);
  });

  it("lets the client approve on master while fewer than two editor seats are taken", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "master", members: [m("owner"), m("contractor")] })).toEqual(registered);
  });

  it("does not count viewers against the editor seats", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "master", members: [m("owner"), m("contractor"), m("viewer"), m("viewer")] }))
      .toEqual(registered);
  });

  it("disables approval on master once both editor seats are taken", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "master", members: [m("owner"), m("contractor"), m("co_owner")] }))
      .toEqual(disabled);
  });

  it("disables approval on free even with only the owner", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "free", members: [m("owner")] })).toEqual(disabled);
  });

  it("keeps approval disabled while the owner's plan is unknown", () => {
    expect(resolveShareApprovalPolicy({ ownerPlanCode: null, members: [m("owner")] })).toEqual(disabled);
    expect(resolveShareApprovalPolicy({ ownerPlanCode: "enterprise", members: [m("owner")] })).toEqual(disabled);
  });
});

describe("resolveOwnerPlanCode", () => {
  const owner: OwnerPlanInput = {
    workspaceKind: "supabase",
    viewerIsOwner: true,
    authenticated: true,
    subscription: { isLoading: false, isError: false, planCode: "brigade" },
    demoOwnerPlan: "free",
    membersLoading: false,
    ownerRowLoaded: true,
  };

  it("reads the owner's live plan", () => {
    expect(resolveOwnerPlanCode(owner)).toBe("brigade");
  });

  it("reads no subscription as free", () => {
    expect(resolveOwnerPlanCode({ ...owner, subscription: { isLoading: false, isError: false, planCode: null } })).toBe("free");
  });

  it("is unknown for anyone but the owner", () => {
    expect(resolveOwnerPlanCode({ ...owner, viewerIsOwner: false })).toBeNull();
  });

  it("is unknown while the subscription loads or after it failed", () => {
    expect(resolveOwnerPlanCode({ ...owner, subscription: { isLoading: true, isError: false, planCode: undefined } })).toBeNull();
    expect(resolveOwnerPlanCode({ ...owner, subscription: { isLoading: false, isError: true, planCode: undefined } })).toBeNull();
  });

  it("is unknown before sign-in and while members load", () => {
    expect(resolveOwnerPlanCode({ ...owner, authenticated: false })).toBeNull();
    expect(resolveOwnerPlanCode({ ...owner, membersLoading: true })).toBeNull();
  });

  it("is unknown when the members list came back without the owner's row", () => {
    expect(resolveOwnerPlanCode({ ...owner, ownerRowLoaded: false })).toBeNull();
  });

  it("maps the seeded plan in demo and knows nothing in local mode", () => {
    expect(resolveOwnerPlanCode({ ...owner, workspaceKind: "demo", demoOwnerPlan: "pro" })).toBe("master");
    expect(resolveOwnerPlanCode({ ...owner, workspaceKind: "local" })).toBeNull();
  });
});
