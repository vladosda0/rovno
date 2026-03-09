import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as store from "@/data/store";
import {
  clearDemoSession,
  clearStoredLocalAuthProfile,
  setSimulatedAuthRole,
  setStoredLocalAuthProfile,
} from "@/lib/auth-state";
import {
  createWorkspaceProject,
  filterActiveProjectRows,
  mapProfileRowToUser,
  mapProjectMemberRowToMember,
  mapProjectRowToProject,
  selectWorkspaceMode,
} from "@/data/workspace-source";

const singleMock = vi.fn();
const selectMock = vi.fn(() => ({ single: singleMock }));
const insertMock = vi.fn(() => ({ select: selectMock }));
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
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
    ...overrides,
  };
}

describe("workspace-source helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStoredLocalAuthProfile();
    clearDemoSession();
    setSimulatedAuthRole("guest");
    store.__unsafeResetStoreForTests();
    fromMock.mockClear();
    insertMock.mockClear();
    selectMock.mockClear();
    singleMock.mockReset();
  });

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

  it("creates a local workspace project with the existing manual bootstrap side effects", async () => {
    const profile = setStoredLocalAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setSimulatedAuthRole("owner");
    store.__unsafeResetStoreForTests();

    const createdProject = await createWorkspaceProject(
      { kind: "local" },
      {
        title: "Manual Project",
        type: "residential",
        projectMode: "contractor",
        ownerId: profile.id,
      },
    );

    const createdMember = store.getMembers(createdProject.id);
    const createdStages = store.getStages(createdProject.id);
    const eventTypes = store.getEvents(createdProject.id).map((event) => event.type);

    expect(createdProject).toMatchObject({
      owner_id: profile.id,
      title: "Manual Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "manual",
      progress_pct: 0,
    });
    expect(store.getProject(createdProject.id)).toEqual(createdProject);
    expect(createdStages).toHaveLength(1);
    expect(createdProject.current_stage_id).toBe(createdStages[0]?.id);
    expect(createdStages[0]).toMatchObject({
      project_id: createdProject.id,
      title: "Stage 1",
      order: 1,
      status: "open",
    });
    expect(createdMember).toEqual([
      {
        project_id: createdProject.id,
        user_id: profile.id,
        role: "owner",
        ai_access: "project_pool",
        credit_limit: 500,
        used_credits: 0,
      },
    ]);
    expect(eventTypes).toEqual(expect.arrayContaining([
      "stage_created",
      "project_created",
      "estimate.project_mode_set",
    ]));
  });

  it("creates a Supabase workspace project with the minimal insert payload", async () => {
    singleMock.mockResolvedValue({
      data: projectRow({
        id: "project-supabase",
        owner_profile_id: "profile-1",
        title: "Supabase Project",
        project_type: "commercial",
        project_mode: "build_myself",
        current_stage_id: null,
      }),
      error: null,
    });

    const createdProject = await createWorkspaceProject(
      { kind: "supabase", profileId: "profile-1" },
      {
        title: "Supabase Project",
        type: "commercial",
        projectMode: "build_myself",
        ownerId: "profile-1",
      },
    );

    expect(fromMock).toHaveBeenCalledWith("projects");
    expect(insertMock).toHaveBeenCalledWith({
      owner_profile_id: "profile-1",
      title: "Supabase Project",
      project_type: "commercial",
      project_mode: "build_myself",
    });
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(createdProject).toEqual({
      id: "project-supabase",
      owner_id: "profile-1",
      title: "Supabase Project",
      type: "commercial",
      project_mode: "build_myself",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 42,
      address: "123 Test St",
      ai_description: "AI summary",
    });
  });

  it("creates a local workspace project without manual bootstrap side effects when requested", async () => {
    const profile = setStoredLocalAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setSimulatedAuthRole("owner");
    store.__unsafeResetStoreForTests();

    const createdProject = await createWorkspaceProject(
      { kind: "local" },
      {
        title: "AI Project",
        type: "residential",
        projectMode: "contractor",
        ownerId: profile.id,
      },
      {
        bootstrapLocalProject: false,
      },
    );

    expect(createdProject).toMatchObject({
      owner_id: profile.id,
      title: "AI Project",
      current_stage_id: "",
      automation_level: "manual",
    });
    expect(store.getMembers(createdProject.id)).toEqual([
      {
        project_id: createdProject.id,
        user_id: profile.id,
        role: "owner",
        ai_access: "project_pool",
        credit_limit: 500,
        used_credits: 0,
      },
    ]);
    expect(store.getStages(createdProject.id)).toEqual([]);
    expect(store.getEvents(createdProject.id)).toEqual([]);
  });
});
