import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as workspaceSource from "@/data/workspace-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import AppLayout from "@/layouts/AppLayout";
import { openPhotoConsult } from "@/lib/photo-consult-store";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
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

function renderAppLayout({
  initialEntries = ["/home"],
  queryClient = createQueryClient(),
}: {
  initialEntries?: string[];
  queryClient?: QueryClient;
} = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/home" element={<div>Home</div>} />
            <Route path="/demo" element={<div>Demo Route</div>} />
            <Route path="/settings" element={<div>Settings</div>} />
            <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
          </Route>
          <Route path="/auth/login" element={<div>Login</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setSimulatedAuthRole("guest");
    clearStoredLocalAuthProfile();
    clearDemoSession();
    __unsafeResetStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("allows local mode guests to access app-shell routes", () => {
    renderAppLayout();

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
  });

  it("allows demo sessions to access app-shell routes", () => {
    enterDemoSession("project-1");

    renderAppLayout();

    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("allows authenticated Supabase runtime access", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");

    const queryClient = createQueryClient();
    queryClient.setQueryData(workspaceQueryKeys.mode(), {
      kind: "supabase",
      profileId: "profile-1",
    });
    queryClient.setQueryData(workspaceQueryKeys.currentUser("profile-1"), {
      id: "profile-1",
      email: "owner@example.com",
      name: "Owner User",
      locale: "en",
      timezone: "UTC",
      plan: "pro",
      credits_free: 10,
      credits_paid: 20,
    });
    queryClient.setQueryData(workspaceQueryKeys.projects("profile-1"), []);

    renderAppLayout({ queryClient });

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Login")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated Supabase runtime to login", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");

    const queryClient = createQueryClient();
    queryClient.setQueryData(workspaceQueryKeys.mode(), { kind: "local" });

    renderAppLayout({ queryClient });

    await waitFor(() => {
      expect(screen.getByText("Login")).toBeInTheDocument();
    });
  });

  it("shows a loading state while Supabase auth resolution is pending", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon-key");
    vi.spyOn(workspaceSource, "resolveWorkspaceMode").mockImplementation(() => new Promise(() => {}));

    renderAppLayout();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("auto-opens the AI sidebar when photo consult is triggered while collapsed", async () => {
    const profile = setStoredLocalAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setSimulatedAuthRole("owner");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-1",
      owner_id: profile.id,
      title: "Project One",
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-1",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });

    renderAppLayout({ initialEntries: ["/project/project-1/dashboard"] });

    expect(screen.getByRole("button", { name: "Open AI sidebar" })).toBeInTheDocument();

    act(() => {
      openPhotoConsult({
        photo: {
          id: "photo-1",
          project_id: "project-1",
          caption: "Paver alignment check",
          uploader_id: "owner",
          is_final: false,
          created_at: "2026-03-07T10:00:00.000Z",
        },
      });
    });

    expect(await screen.findByText("Paver alignment check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open AI sidebar" })).not.toBeInTheDocument();
  });
});
