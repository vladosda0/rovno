import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/data/store";
import {
  createWorkspaceProjectInvite,
  filterActiveProjectRows,
  getWorkspaceSource,
  mapProfileRowToUser,
  mapProjectMemberRowToMember,
  mapProjectRowToProject,
  selectWorkspaceMode,
  sendWorkspaceProjectInviteEmail,
  updateWorkspaceProjectInvite,
  updateWorkspaceProjectMemberRole,
} from "@/data/workspace-source";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

function profileRow(overrides: Partial<Parameters<typeof mapProfileRowToUser>[0]> = {}) {
  return {
    id: "profile-1",
    email: "owner@example.com",
    full_name: "Owner User",
    avatar_url: "https://example.com/avatar.png",
    locale: "en" as const,
    timezone: "UTC",
    plan: "pro" as const,
    credits_free: 5,
    credits_paid: 25,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function projectRow(overrides: Partial<Parameters<typeof mapProjectRowToProject>[0]> = {}) {
  return {
    id: "project-1",
    owner_profile_id: "profile-1",
    title: "Workspace Project",
    project_type: "residential",
    project_mode: "contractor" as const,
    automation_level: "assisted" as const,
    current_stage_id: "stage-1",
    progress_pct: 42,
    address: "123 Test St",
    ai_description: "AI summary",
    archived_at: null,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-02T00:00:00.000Z",
    ...overrides,
  };
}

function memberRow(overrides: Partial<Parameters<typeof mapProjectMemberRowToMember>[0]> = {}) {
  return {
    id: "member-1",
    project_id: "project-1",
    profile_id: "profile-2",
    role: "contractor" as const,
    ai_access: "consult_only" as const,
    viewer_regime: null,
    credit_limit: 50,
    used_credits: 10,
    joined_at: "2026-03-01T00:00:00.000Z",
    finance_visibility: "none" as const,
    ...overrides,
  };
}

describe("sendWorkspaceProjectInviteEmail", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("invokes send-project-invite with inviteId for Supabase mode", async () => {
    const inviteId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    invokeMock.mockResolvedValue({
      data: {
        ok: true,
        inviteId,
        recipientEmail: "x@example.com",
        providerMessageId: "msg-1",
      },
      error: null,
    });

    const result = await sendWorkspaceProjectInviteEmail({ kind: "supabase", profileId: "p1" }, inviteId);

    expect(invokeMock).toHaveBeenCalledWith("send-project-invite", expect.objectContaining({
      body: { inviteId },
    }));
    expect(result).toEqual({
      kind: "sent",
      payload: {
        ok: true,
        inviteId,
        recipientEmail: "x@example.com",
        providerMessageId: "msg-1",
      },
    });
  });

  it("returns parsed success when the edge function responds without providerMessageId", async () => {
    const inviteId = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    invokeMock.mockResolvedValue({
      data: { ok: true, inviteId, recipientEmail: "y@example.com" },
      error: null,
    });

    const result = await sendWorkspaceProjectInviteEmail({ kind: "supabase", profileId: "p1" }, inviteId);

    expect(result.kind).toBe("sent");
    if (result.kind === "sent") {
      expect(result.payload).toEqual({
        ok: true,
        inviteId,
        recipientEmail: "y@example.com",
        providerMessageId: undefined,
      });
    }
  });

  it("throws a normalized Error when the function returns an error field in the body", async () => {
    invokeMock.mockResolvedValue({
      data: { error: "Invite not found" },
      error: null,
    });

    await expect(
      sendWorkspaceProjectInviteEmail({ kind: "supabase", profileId: "p1" }, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"),
    ).rejects.toThrow("Invite not found");
  });

  it("throws using invoke error message when the client reports an error", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { message: "Edge function returned a non-2xx status code" },
    });

    await expect(
      sendWorkspaceProjectInviteEmail({ kind: "supabase", profileId: "p1" }, "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"),
    ).rejects.toThrow("Edge function returned a non-2xx status code");
  });

  it("does not invoke the edge function for local or demo mode", async () => {
    await expect(sendWorkspaceProjectInviteEmail({ kind: "local" }, "any-id")).resolves.toEqual({ kind: "skipped" });
    await expect(sendWorkspaceProjectInviteEmail({ kind: "demo" }, "any-id")).resolves.toEqual({ kind: "skipped" });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("throws for guest mode", async () => {
    await expect(sendWorkspaceProjectInviteEmail({ kind: "guest" }, "any-id")).rejects.toThrow(
      "An authenticated Supabase session is required.",
    );
  });
});

describe("workspace-source helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps profile rows to the frontend User contract with explicit fallbacks", () => {
    const user = mapProfileRowToUser(profileRow({
      email: null,
      full_name: null,
      avatar_url: null,
    }));

    expect(user).toEqual({
      id: "profile-1",
      email: "",
      name: "Unknown user",
      avatar: undefined,
      locale: "en",
      timezone: "UTC",
      plan: "pro",
      credits_free: 5,
      credits_paid: 25,
    });
  });

  it("maps project rows to the frontend Project contract with null stage fallback", () => {
    const project = mapProjectRowToProject(projectRow({
      current_stage_id: null,
      address: null,
      ai_description: null,
    }));

    expect(project).toEqual({
      id: "project-1",
      owner_id: "profile-1",
      title: "Workspace Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 42,
      address: undefined,
      ai_description: undefined,
    });
  });

  it("maps member rows to the frontend Member contract with viewer regime fallback", () => {
    const member = mapProjectMemberRowToMember(memberRow({
      viewer_regime: null,
    }));

    expect(member).toEqual({
      project_id: "project-1",
      user_id: "profile-2",
      role: "contractor",
      viewer_regime: undefined,
      ai_access: "consult_only",
      finance_visibility: "none",
      credit_limit: 50,
      used_credits: 10,
    });
  });

  it("excludes archived projects from the active workspace slice", () => {
    const activeProjects = filterActiveProjectRows([
      projectRow({ id: "project-active", archived_at: null }),
      projectRow({ id: "project-archived", archived_at: "2026-03-05T00:00:00.000Z" }),
    ]);

    expect(activeProjects.map((project) => project.id)).toEqual(["project-active"]);
  });

  it("falls back to local mode when Supabase is requested without a session", () => {
    const mode = selectWorkspaceMode({
      requestedSource: "supabase",
      hasSupabaseConfig: true,
      sessionProfileId: null,
    });

    expect(mode).toEqual({ kind: "local" });
  });

  it("prioritizes an explicit demo session over local or Supabase mode", () => {
    const mode = selectWorkspaceMode({
      requestedSource: "supabase",
      hasSupabaseConfig: true,
      sessionProfileId: "profile-1",
      demoSessionActive: true,
    });

    expect(mode).toEqual({ kind: "demo" });
  });

  it("creates manual browser-backed projects through the legacy store adapters", async () => {
    const currentUser = {
      id: "profile-1",
      email: "owner@example.com",
      name: "Owner User",
      locale: "en",
      timezone: "UTC",
      plan: "free" as const,
      credits_free: 0,
      credits_paid: 0,
    };
    const addProjectSpy = vi.spyOn(store, "addProject").mockImplementation(() => undefined);
    const addMemberSpy = vi.spyOn(store, "addMember").mockImplementation(() => undefined);
    vi.spyOn(store, "getCurrentUserForMode").mockReturnValue(currentUser);

    const source = await getWorkspaceSource({ kind: "local" });
    const createdProject = await source.createProject({
      title: "  Manual Project  ",
      type: "residential",
      projectMode: "contractor",
    });

    expect(createdProject).toEqual({
      id: expect.stringMatching(/^project-manual-/),
      owner_id: "profile-1",
      title: "Manual Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "manual",
      current_stage_id: "",
      progress_pct: 0,
    });
    expect(addProjectSpy).toHaveBeenCalledWith(createdProject);
    expect(addMemberSpy).toHaveBeenCalledWith({
      project_id: createdProject.id,
      user_id: "profile-1",
      role: "owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      credit_limit: 500,
      used_credits: 0,
    });
  });

  it("updates local project members with bounded permission fields", async () => {
    store.__unsafeResetStoreForTests();
    store.addMember({
      project_id: "project-1",
      user_id: "profile-2",
      role: "contractor",
      ai_access: "consult_only",
      finance_visibility: "summary",
      credit_limit: 50,
      used_credits: 10,
      internal_docs_visibility: "view",
    } as never);

    const updated = await updateWorkspaceProjectMemberRole(
      { kind: "local" },
      {
        projectId: "project-1",
        userId: "profile-2",
        role: "viewer",
        aiAccess: "none",
        viewerRegime: "client",
        creditLimit: 0,
        financeVisibility: "none",
        internalDocsVisibility: "none",
      },
    );

    expect(updated).toMatchObject({
      project_id: "project-1",
      user_id: "profile-2",
      role: "viewer",
      ai_access: "none",
      viewer_regime: "client",
      finance_visibility: "none",
      credit_limit: 0,
      internal_docs_visibility: "none",
    });
  });

  it("updates local project invites with bounded permission fields", async () => {
    store.__unsafeResetStoreForTests();
    store.addProjectInvite({
      id: "invite-1",
      project_id: "project-1",
      email: "invitee@example.com",
      role: "contractor",
      ai_access: "consult_only",
      viewer_regime: null,
      credit_limit: 50,
      invited_by: "profile-1",
      status: "pending",
      invite_token: "token-1",
      accepted_profile_id: null,
      created_at: "2026-03-01T00:00:00.000Z",
      accepted_at: null,
      finance_visibility: "detail",
      internal_docs_visibility: "view",
    } as never, "local");

    const updated = await updateWorkspaceProjectInvite(
      { kind: "local" },
      {
        id: "invite-1",
        projectId: "project-1",
        role: "viewer",
        aiAccess: "none",
        viewerRegime: "client",
        creditLimit: 5,
        financeVisibility: "summary",
        internalDocsVisibility: "none",
        status: "pending",
      },
    );

    expect(updated).toMatchObject({
      id: "invite-1",
      role: "viewer",
      ai_access: "none",
      viewer_regime: "client",
      credit_limit: 5,
      finance_visibility: "summary",
      internal_docs_visibility: "none",
    });
  });

  it("defaults contractor invite finance visibility to the role baseline", async () => {
    store.__unsafeResetStoreForTests();

    const created = await createWorkspaceProjectInvite(
      { kind: "local" },
      {
        projectId: "project-1",
        email: "contractor@example.com",
        role: "contractor",
        aiAccess: "consult_only",
        viewerRegime: null,
        creditLimit: 50,
        invitedBy: "profile-1",
      },
    );

    expect(created.finance_visibility).toBe("none");
  });
});
