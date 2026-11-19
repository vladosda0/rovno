import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import { closeClientReportDialog, getClientReportDialogProjectId } from "@/lib/client-report-dialog";

const media = vi.hoisted(() => ({
  prepareUpload: vi.fn(async () => ({ bucket: "media", objectPath: "p/x.jpg", uploadIntentId: "intent-1" })),
  uploadBytes: vi.fn(async () => undefined),
  finalizeUpload: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/use-documents-media-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-documents-media-source")>()),
  useMediaUploadMutations: () => media,
}));
vi.mock("heic2any", () => ({ default: async () => new Blob(["decoded"], { type: "image/jpeg" }) }));
vi.mock("browser-image-compression", () => ({ default: async (file: File) => file }));

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

  it("uploads a HEIC photo typed as PNG as a JPEG", async () => {
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
              canCreateTask={false}
              canCreateDocument={false}
              canCreatePhoto
              canManageProcurement={false}
              canManageParticipants={false}
              actorRole="owner"
            />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Photo" }));
    const dialog = screen.getByRole("dialog");
    const header = new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic"), 0, 0, 0, 0]);
    const files = [new File([header], "img_3641.png", { type: "image/png" })];
    fireEvent.change(dialog.querySelector('input[type="file"]') as HTMLInputElement, { target: { files } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(media.finalizeUpload).toHaveBeenCalled());
    expect(media.prepareUpload).toHaveBeenCalledWith(
      expect.objectContaining({ clientFilename: "img_3641.jpg", mimeType: "image/jpeg" }),
    );
    expect((media.uploadBytes.mock.calls[0] as unknown[])[2]).toMatchObject({ type: "image/jpeg" });
  });
});
