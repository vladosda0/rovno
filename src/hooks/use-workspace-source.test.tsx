import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as store from "@/data/store";
import {
  selectWorkspaceRuntimeAuthState,
  useWorkspaceCurrentUser,
  workspaceQueryKeys,
} from "@/hooks/use-workspace-source";
import {
  clearDemoSession,
  clearStoredLocalAuthProfile,
  enterDemoSession,
  setSimulatedAuthRole,
  setStoredLocalAuthProfile,
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

function CurrentUserProbe() {
  const user = useWorkspaceCurrentUser();

  return (
    <div>
      <span data-testid="user-id">{user.id || "<empty>"}</span>
      <span data-testid="user-email">{user.email || "<empty>"}</span>
    </div>
  );
}

describe("selectWorkspaceRuntimeAuthState", () => {
  it("treats local mode as workspace-accessible while preserving simulated guest state", () => {
    expect(selectWorkspaceRuntimeAuthState({
      hasSupabaseConfig: false,
      localCompatibilityAuthenticated: false,
      mode: { kind: "local" },
      supabaseRequested: false,
    })).toEqual({
      authPending: false,
      canAccessWorkspace: true,
      isGuest: true,
      runtimeKind: "local",
    });
  });

  it("preserves demo workspace access while still reflecting simulated guest state", () => {
    expect(selectWorkspaceRuntimeAuthState({
      hasSupabaseConfig: true,
      localCompatibilityAuthenticated: false,
      mode: { kind: "demo" },
      supabaseRequested: true,
    })).toEqual({
      authPending: false,
      canAccessWorkspace: true,
      isGuest: true,
      runtimeKind: "demo",
    });
  });

  it("treats a resolved Supabase session as authenticated workspace runtime", () => {
    expect(selectWorkspaceRuntimeAuthState({
      hasSupabaseConfig: true,
      localCompatibilityAuthenticated: false,
      mode: { kind: "supabase", profileId: "profile-1" },
      supabaseRequested: true,
    })).toEqual({
      authPending: false,
      canAccessWorkspace: true,
      isGuest: false,
      runtimeKind: "supabase",
    });
  });

  it("treats Supabase requested and configured without a session as guest runtime", () => {
    expect(selectWorkspaceRuntimeAuthState({
      hasSupabaseConfig: true,
      localCompatibilityAuthenticated: true,
      mode: { kind: "local" },
      supabaseRequested: true,
    })).toEqual({
      authPending: false,
      canAccessWorkspace: false,
      isGuest: true,
      runtimeKind: "supabase",
    });
  });

  it("treats Supabase requested without config as true local mode", () => {
    expect(selectWorkspaceRuntimeAuthState({
      hasSupabaseConfig: false,
      localCompatibilityAuthenticated: true,
      mode: { kind: "local" },
      supabaseRequested: true,
    })).toEqual({
      authPending: false,
      canAccessWorkspace: true,
      isGuest: false,
      runtimeKind: "local",
    });
  });
});

describe("useWorkspaceCurrentUser", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setSimulatedAuthRole("guest");
    clearStoredLocalAuthProfile();
    clearDemoSession();
    store.__unsafeResetStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not fall back to simulated browser auth when Supabase runtime is unauthenticated", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");

    const profile = setStoredLocalAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setSimulatedAuthRole("owner");
    store.__unsafeResetStoreForTests();

    const queryClient = createQueryClient();
    queryClient.setQueryData(workspaceQueryKeys.mode(), { kind: "local" });
    const getCurrentUserSpy = vi.spyOn(store, "getCurrentUser");

    render(
      <QueryClientProvider client={queryClient}>
        <CurrentUserProbe />
      </QueryClientProvider>,
    );

    expect(profile.email).toBe("owner@example.com");
    expect(screen.getByTestId("user-id")).toHaveTextContent("<empty>");
    expect(screen.getByTestId("user-email")).toHaveTextContent("<empty>");
    expect(getCurrentUserSpy).not.toHaveBeenCalled();
  });

  it("still uses demo/local store users outside authenticated Supabase runtime", () => {
    enterDemoSession("project-1");
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <CurrentUserProbe />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("user-id")).toHaveTextContent("user-1");
    expect(screen.getByTestId("user-email")).toHaveTextContent("alex@stroyagent.io");
  });
});
