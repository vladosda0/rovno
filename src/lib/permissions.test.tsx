import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/data/store";
import { seamCanViewSensitiveDetail, usePermission } from "@/lib/permissions";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { Member, User } from "@/types/entities";
import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function PermissionProbe({ projectId }: { projectId: string }) {
  const permission = usePermission(projectId);

  return (
    <div>
      <span data-testid="role">{permission.role}</span>
      <span data-testid="can-ai">{String(permission.can("ai.generate"))}</span>
      <span data-testid="can-invite">{String(permission.can("member.invite"))}</span>
      <span data-testid="can-sensitive">{String(seamCanViewSensitiveDetail(permission.seam))}</span>
    </div>
  );
}

function currentUser(): User {
  return {
    id: "profile-1",
    email: "owner@example.com",
    name: "Owner User",
    locale: "en",
    timezone: "UTC",
    plan: "pro",
    credits_free: 10,
    credits_paid: 20,
  };
}

function member(partial: Partial<Member>): Member {
  return {
    project_id: "project-1",
    user_id: "profile-1",
    role: "contractor",
    ai_access: "consult_only",
    credit_limit: 50,
    used_credits: 5,
    ...partial,
  };
}

describe("usePermission", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearStoredAuthProfile();
    clearDemoSession();
  });

  it("reads role and AI access from the workspace query cache instead of demo store getters", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const getCurrentUserSpy = vi.spyOn(store, "getCurrentUser");
    const getMembersSpy = vi.spyOn(store, "getMembers");
    const queryClient = createQueryClient();
    const user = currentUser();
    const membersKey = workspaceQueryKeys.projectMembers(user.id, "project-1");

    authenticateRuntimeAuth(user.id);
    queryClient.setQueryData(workspaceQueryKeys.currentUser(user.id), user);
    queryClient.setQueryData(membersKey, [
      member({ role: "contractor", ai_access: "consult_only" }),
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("contractor");
    });
    expect(screen.getByTestId("can-ai")).toHaveTextContent("true");
    expect(screen.getByTestId("can-invite")).toHaveTextContent("false");
    expect(getCurrentUserSpy).not.toHaveBeenCalled();
    expect(getMembersSpy).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(membersKey, [
        member({ role: "co_owner", ai_access: "project_pool" }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("co_owner");
    });
    expect(screen.getByTestId("can-ai")).toHaveTextContent("true");
    expect(screen.getByTestId("can-invite")).toHaveTextContent("true");
  });

  it("applies fail-safe finance visibility when simulating local viewer and contractor roles", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "local");
    store.__unsafeResetStoreForTests();

    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });

    store.addProject({
      id: "project-1",
      owner_id: profile.id,
      title: "Workspace Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    store.addMember({
      project_id: "project-1",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      credit_limit: 500,
      used_credits: 0,
    });

    setAuthRole("viewer");
    const firstClient = createQueryClient();
    const first = render(
      <QueryClientProvider client={firstClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("viewer");
    });
    expect(screen.getByTestId("can-sensitive")).toHaveTextContent("false");
    first.unmount();

    setAuthRole("contractor");
    const secondClient = createQueryClient();
    render(
      <QueryClientProvider client={secondClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("contractor");
    });
    expect(screen.getByTestId("can-sensitive")).toHaveTextContent("false");
  });
});

describe("seamCanViewSensitiveDetail", () => {
  function seam(partial: Partial<ProjectAuthoritySeam>): ProjectAuthoritySeam {
    return {
      projectId: "project-1",
      profileId: "profile-1",
      project: null,
      membership: null,
      ...partial,
    };
  }

  it("fails closed when membership is missing", () => {
    expect(seamCanViewSensitiveDetail(seam({ membership: null }))).toBe(false);
  });

  it("fails closed when finance visibility is missing or unknown for non-owners", () => {
    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: undefined }),
    }))).toBe(false);

    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: "summary" }),
    }))).toBe(false);
  });

  it("allows owners and explicit detail visibility", () => {
    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "owner", finance_visibility: undefined }),
    }))).toBe(true);

    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: "detail" }),
    }))).toBe(true);
  });
});
