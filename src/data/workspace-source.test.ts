import { describe, expect, it } from "vitest";
import {
  filterActiveProjectRows,
  mapProfileRowToUser,
  mapProjectMemberRowToMember,
  mapProjectRowToProject,
  selectWorkspaceMode,
} from "@/data/workspace-source";

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
});
