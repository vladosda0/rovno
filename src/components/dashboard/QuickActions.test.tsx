import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";

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
              canManageParticipants
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
});
