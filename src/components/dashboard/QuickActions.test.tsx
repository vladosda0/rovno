import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import { closeClientReportDialog, getClientReportDialogProjectId } from "@/lib/client-report-dialog";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("QuickActions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("shows upload-only document creation and the Supabase persistence hint", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-77");

    render(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <MemoryRouter>
            <QuickActions
              projectId="project-1"
              members={[]}
              stages={[]}
              tasks={[]}
              canCreateTask
              canCreateDocument
              canCreatePhoto
              canManageProcurement
              canManageParticipants
              actorRole="owner"
              actorAiAccess="project_pool"
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Document" }));

    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.getByText(
      "Supabase mode saves the document record only. File contents, download, and sharing are coming soon.",
    )).toBeInTheDocument();
  });

  it("does not render a participant quick action button", () => {
    authenticateRuntimeAuth("profile-77");

    render(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <MemoryRouter>
            <QuickActions
              projectId="project-1"
              members={[]}
              stages={[]}
              tasks={[]}
              canCreateTask
              canCreateDocument
              canCreatePhoto
              canManageProcurement
              canManageParticipants
              actorRole="owner"
              actorAiAccess="project_pool"
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole("button", { name: "Participant" })).not.toBeInTheDocument();
  });

  function renderForReport(canShareClientReport: boolean) {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <TooltipProvider>
          <MemoryRouter>
            <QuickActions
              projectId="project-1"
              members={[]}
              stages={[]}
              tasks={[]}
              canCreateTask
              canCreateDocument
              canCreatePhoto
              canManageProcurement={false}
              canManageParticipants={false}
              canShareClientReport={canShareClientReport}
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  }

  it("offers the client report to an owner or co-owner and opens its dialog", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-77");

    renderForReport(true);
    fireEvent.click(screen.getByRole("button", { name: "Client report" }));

    expect(getClientReportDialogProjectId()).toBe("project-1");
    closeClientReportDialog();
  });

  it("hides the client report from a contractor or viewer", () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-77");

    renderForReport(false);

    // Positive first, so the absence below is not an empty render.
    expect(screen.getByRole("button", { name: "Document" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client report" })).not.toBeInTheDocument();
  });

  it("does not offer the client report outside the real backend", () => {
    authenticateRuntimeAuth("profile-77");

    renderForReport(true);

    expect(screen.getByRole("button", { name: "Document" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client report" })).not.toBeInTheDocument();
  });
});
