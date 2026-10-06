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

/** Lazy `AISidebar` + Suspense can exceed RTL's default findBy timeout on slow CI runners. */
const SIDEBAR_FIND_TIMEOUT_MS = 10_000;

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
  beforeEach(async () => {
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

    // Warm module cache so AppLayout's `lazy(() => import(AISidebar))` resolves under parallel test load.
    await import("@/components/AISidebar");
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
    expect(await screen.findByPlaceholderText("Ask AI...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
  });

  it("restores explicit close preference across remount in the same session", async () => {
    const firstRender = renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: /toggle ai sidebar/i }, { timeout: SIDEBAR_FIND_TIMEOUT_MS }));
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
    firstRender.unmount();

    renderLayout();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
  });

  it("does not mount project AI sidebar on /home (MVP policy)", async () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<div>Home surface</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByPlaceholderText("Ask AI...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /toggle ai sidebar/i })).not.toBeInTheDocument();
  });

  it("opens again after clearing session preference", async () => {
    writeAiSidebarSessionPreference(true);
    const collapsedRender = renderLayout();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
    collapsedRender.unmount();

    clearAiSidebarSessionPreference();
    const reopenedRender = renderLayout();
    expect(await screen.findByPlaceholderText("Ask AI...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    reopenedRender.unmount();
  });

  it("shows Shurik hanging in the corner instead of a strip when the sidebar is collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    const { container } = renderLayout();

    const opener = screen.getByRole("button", { name: "Open Shurik" });
    const figure = opener.querySelector("img");
    expect(figure?.getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure?.parentElement).toHaveClass("animate-shurik-sway");
    expect(opener).toHaveClass("fixed", "bottom-4", "left-4");
    expect(container.querySelector(".w-12.border-r")).toBeNull();

    fireEvent.click(opener);
    expect(await screen.findByPlaceholderText("Ask AI...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
  });

  it("leaves room under the page for the hanging Shurik only while the sidebar is collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();
    expect(screen.getByRole("main")).toHaveClass("md:pb-24");

    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    await screen.findByPlaceholderText("Ask AI...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS });
    expect(screen.getByRole("main")).not.toHaveClass("md:pb-24");
  });

  it("adds no room under pages that have no Shurik, even with the collapsed preference stored", () => {
    writeAiSidebarSessionPreference(true);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<div>Home surface</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("md:pb-24");
  });

  it("keeps the hanging Shurik off screens narrower than the tablet breakpoint", () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();

    expect(screen.getByRole("button", { name: "Open Shurik" })).toHaveClass("hidden", "md:block");
  });

  it("auto-opens the AI sidebar when photo consult is triggered while collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();

    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();

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
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("workspace-ai-sidebar-collapsed")).toBe("true");
  });
});
