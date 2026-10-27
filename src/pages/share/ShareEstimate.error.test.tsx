import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareEstimate from "@/pages/share/ShareEstimate";
import {
  createVersionSnapshot,
  findVersionByShareId,
  submitVersion,
} from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import { __unsafeResetRuntimeAuthForTests } from "@/hooks/use-runtime-auth";
import { guestRuntimeAuth } from "@/test/runtime-auth";

const { fetchRemote } = vi.hoisted(() => ({ fetchRemote: vi.fn() }));

vi.mock("@/data/estimate-share-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/estimate-share-source")>()),
  fetchSharedEstimateVersion: fetchRemote,
}));

function renderSharePage(shareId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/share/estimate/${shareId}`]}>
        <Routes>
          <Route path="/share/estimate/:shareId" element={<ShareEstimate />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShareEstimate load failure", () => {
  beforeEach(() => {
    clearDemoSession();
    fetchRemote.mockReset();
    guestRuntimeAuth();
  });

  afterEach(() => {
    clearDemoSession();
    setAuthRole("owner");
    __unsafeResetRuntimeAuthForTests();
  });

  it("tells the client the estimate could not load, not that the link is dead, and retries", async () => {
    setAuthRole("owner");
    enterDemoSession("project-1");
    const created = createVersionSnapshot("project-1", "user-1");
    expect(submitVersion("project-1", created.versionId)).toBe(true);
    const shared = findVersionByShareId(created.shareId);
    expect(shared).toBeTruthy();
    clearDemoSession();

    fetchRemote.mockRejectedValue(new Error("network down"));
    renderSharePage("unknown-share-for-local-store");

    expect(await screen.findByText("Could not load the estimate", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("Shared estimate not found")).not.toBeInTheDocument();

    let resolveRetry: (value: typeof shared) => void = () => {};
    fetchRemote.mockImplementation(() => new Promise((resolve) => { resolveRetry = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    resolveRetry(shared);

    expect(await screen.findByText("Estimate preview")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the estimate")).not.toBeInTheDocument();
    expect(fetchRemote).toHaveBeenCalledTimes(3);
  });

  it("still says not found when the server answers that the link does not exist", async () => {
    fetchRemote.mockResolvedValue(null);
    renderSharePage("no-such-share");

    expect(await screen.findByText("Shared estimate not found")).toBeInTheDocument();
    expect(screen.queryByText("Could not load the estimate")).not.toBeInTheDocument();
  });
}, 10_000);
