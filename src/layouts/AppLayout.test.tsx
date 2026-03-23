import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import { openPhotoConsult } from "@/lib/photo-consult-store";
import { __unsafeResetStoreForTests, addMember, addProject } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";
import {
  clearAiSidebarSessionPreference,
  writeAiSidebarSessionPreference,
} from "@/lib/ai-sidebar-session";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("AppLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    setAuthRole("owner");
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
  });

  function renderLayout(path = "/project/project-1/dashboard") {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("starts with AI sidebar open when no session preference is set", async () => {
    renderLayout();
    expect(await screen.findByPlaceholderText("Ask AI...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open AI sidebar" })).not.toBeInTheDocument();
  });

  it("restores explicit close preference across remount in the same session", async () => {
    const firstRender = renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: /toggle ai sidebar/i }));
    expect(screen.getByRole("button", { name: "Open AI sidebar" })).toBeInTheDocument();
    firstRender.unmount();

    renderLayout();
    expect(screen.getByRole("button", { name: "Open AI sidebar" })).toBeInTheDocument();
  });

  it("opens again after clearing session preference", async () => {
    writeAiSidebarSessionPreference(true);
    const collapsedRender = renderLayout();
    expect(screen.getByRole("button", { name: "Open AI sidebar" })).toBeInTheDocument();
    collapsedRender.unmount();

    clearAiSidebarSessionPreference();
    const reopenedRender = renderLayout();
    expect(await screen.findByPlaceholderText("Ask AI...")).toBeInTheDocument();
    reopenedRender.unmount();
  });

  it("auto-opens the AI sidebar when photo consult is triggered while collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();

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
    expect(sessionStorage.getItem("workspace-ai-sidebar-collapsed")).toBe("true");
  });
});
