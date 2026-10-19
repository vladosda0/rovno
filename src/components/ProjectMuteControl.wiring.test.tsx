import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileNavSheet } from "@/components/MobileNavSheet";
import { TopBar } from "@/components/TopBar";
import * as store from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, enterDemoSession, setAuthRole } from "@/lib/auth-state";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ data: null, error: null }), auth: { signOut: vi.fn() } },
}));

// Whether the control shows itself is its own suite; here only where it is placed and for which project.
vi.mock("@/components/ProjectMuteControl", () => ({
  ProjectMuteBell: ({ projectId, projectTitle }: { projectId: string; projectTitle: string }) => (
    <span data-testid="project-mute-bell">{`${projectId}|${projectTitle}`}</span>
  ),
  ProjectMuteRow: ({ projectId, projectTitle }: { projectId: string; projectTitle: string }) => (
    <span data-testid="project-mute-row">{`${projectId}|${projectTitle}`}</span>
  ),
}));

function renderAt(path: string, projectId: string | undefined, sheetOpen = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <TopBar aiSidebarCollapsed onToggleAiSidebar={vi.fn()} />
        <MobileNavSheet
          open={sheetOpen}
          onOpenChange={vi.fn()}
          projectId={projectId}
          hideAi
          aiSidebarOpen={false}
          onOpenRoleDialog={vi.fn()}
          onLogout={vi.fn()}
          onExitDemo={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("where 'do not disturb for this project' lives", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearStoredAuthProfile();
    clearDemoSession();
    setAuthRole("owner");
    store.__unsafeResetStoreForTests();
    // The demo is the mode that comes with projects; the stand-ins above do not look at the mode.
    enterDemoSession();
  });

  afterEach(() => {
    cleanup();
    clearDemoSession();
  });

  it("is next to the project's name in the top bar, for the project that is open", () => {
    const project = store.getProjectsForMode("demo")[0];
    renderAt(`/project/${project.id}/dashboard`, project.id);

    expect(screen.getByTestId("project-mute-bell")).toHaveTextContent(`${project.id}|${project.title}`);
    expect(screen.queryByTestId("project-mute-row")).not.toBeInTheDocument();
  });

  it("is a row of the phone's side menu once the menu is open", () => {
    const project = store.getProjectsForMode("demo")[0];
    renderAt(`/project/${project.id}/dashboard`, project.id, true);

    expect(screen.getByTestId("project-mute-row")).toHaveTextContent(`${project.id}|${project.title}`);
  });

  it("is in neither place outside a project, or on a project the person does not have", () => {
    const home = renderAt("/home", undefined, true);
    expect(screen.queryByTestId("project-mute-bell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-mute-row")).not.toBeInTheDocument();
    home.unmount();

    renderAt("/project/no-such-project/dashboard", "no-such-project", true);
    expect(screen.queryByTestId("project-mute-bell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-mute-row")).not.toBeInTheDocument();
  });
});
