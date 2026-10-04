import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ShareEstimate from "@/pages/share/ShareEstimate";
import {
  createVersionSnapshot,
  findVersionByShareId,
  getEstimateV2ProjectState,
  submitVersion,
} from "@/data/estimate-v2-store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";
import { __unsafeResetRuntimeAuthForTests } from "@/hooks/use-runtime-auth";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";

const { approveRemote, fetchRemote, toastSpy } = vi.hoisted(() => ({
  approveRemote: vi.fn(),
  fetchRemote: vi.fn(),
  toastSpy: vi.fn(),
}));

vi.mock("@/data/estimate-share-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/data/estimate-share-source")>()),
  approveSharedEstimateVersion: approveRemote,
  fetchSharedEstimateVersion: fetchRemote,
}));

vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
}));

function createSharedVersion(): { shareId: string; versionId: string } {
  setAuthRole("owner");
  const created = createVersionSnapshot("project-1", "user-1");
  expect(submitVersion("project-1", created.versionId)).toBe(true);
  return { shareId: created.shareId, versionId: created.versionId };
}

function leaveDemoServedByServer(shareId: string) {
  const shared = findVersionByShareId(shareId);
  expect(shared).toBeTruthy();
  fetchRemote.mockResolvedValue(shared);
  clearDemoSession();
}

function renderSharePage(shareId: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/share/estimate/${shareId}`]}>
        <Routes>
          <Route path="/share/estimate/:shareId" element={<ShareEstimate />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillAndSubmitStamp() {
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Ivan" } });
  fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Petrov" } });
  fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "ivan@example.com" } });
  const dialog = screen.getByRole("dialog");
  const submit = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Approve");
  expect(submit).toBeDefined();
  fireEvent.click(submit!);
  return submit!;
}

function localApprovalStamp(versionId: string) {
  return getEstimateV2ProjectState("project-1").versions.find((v) => v.id === versionId)?.approvalStamp ?? null;
}

describe("ShareEstimate approval submit", () => {
  beforeEach(() => {
    clearDemoSession();
    enterDemoSession("project-1");
    approveRemote.mockReset();
    fetchRemote.mockReset();
    fetchRemote.mockRejectedValue(new Error("offline in test"));
    toastSpy.mockReset();
    authenticateRuntimeAuth();
  });

  afterEach(() => {
    clearDemoSession();
    setAuthRole("owner");
    __unsafeResetRuntimeAuthForTests();
  });

  it("reports only the failure when the server rejects the approval, and keeps the form open", async () => {
    const { shareId } = createSharedVersion();
    leaveDemoServedByServer(shareId);
    approveRemote.mockRejectedValue(new Error("share token vanished"));

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy.mock.calls[0]?.[0]).toEqual({ title: "Unable to approve this version", variant: "destructive" });
    expect(approveRemote).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says the version can no longer be approved when the server answers P0002, refetches the share and closes the form", async () => {
    const { shareId } = createSharedVersion();
    leaveDemoServedByServer(shareId);
    approveRemote.mockRejectedValue({
      code: "P0002",
      message: "share token not found, archived, already approved, or approval is disabled",
      details: null,
      hint: null,
    });

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    const fetchesBefore = fetchRemote.mock.calls.length;
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy.mock.calls[0]?.[0]).toEqual({ title: "This version can no longer be approved", variant: "destructive" });
    await waitFor(() => expect(fetchRemote.mock.calls.length).toBeGreaterThan(fetchesBefore));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the server's own text out of the toast for any other rejection", async () => {
    const { shareId } = createSharedVersion();
    leaveDemoServedByServer(shareId);
    approveRemote.mockRejectedValue({
      code: "57014",
      message: "canceling statement due to statement timeout",
      details: null,
      hint: null,
    });

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    const fetchesBefore = fetchRemote.mock.calls.length;
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy.mock.calls[0]?.[0]).toEqual({ title: "Unable to approve this version", variant: "destructive" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(fetchRemote.mock.calls.length).toBe(fetchesBefore);
  });

  it("announces approval once the server has recorded it", async () => {
    const { shareId } = createSharedVersion();
    const shared = findVersionByShareId(shareId);
    leaveDemoServedByServer(shareId);
    approveRemote.mockResolvedValue(shared);

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy.mock.calls[0]?.[0]).toMatchObject({ title: "Approved" });
    expect(approveRemote).toHaveBeenCalledTimes(1);
  });

  it("approves through the local store in a demo session without calling the server", async () => {
    const { shareId, versionId } = createSharedVersion();

    renderSharePage(shareId);
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy.mock.calls[0]?.[0]).toMatchObject({ title: "Approved" });
    expect(approveRemote).not.toHaveBeenCalled();
    expect(localApprovalStamp(versionId)).not.toBeNull();
  });

  it("sends one approval for a double click while the request is in flight", async () => {
    const { shareId } = createSharedVersion();
    const shared = findVersionByShareId(shareId);
    leaveDemoServedByServer(shareId);
    let resolve: (value: unknown) => void = () => {};
    approveRemote.mockReturnValue(new Promise((r) => { resolve = r; }));

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    const submit = fillAndSubmitStamp();
    fireEvent.click(submit);

    expect(approveRemote).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    resolve(shared);
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
  });

  it("sends a real share to the server even while a demo session is open in the tab", async () => {
    const { shareId } = createSharedVersion();
    const shared = findVersionByShareId(shareId);
    const realToken = "real-share-token-0000000000000000";
    fetchRemote.mockImplementation((token: string) => Promise.resolve(token === realToken ? shared : null));
    approveRemote.mockResolvedValue(shared);

    renderSharePage(realToken);
    await screen.findByRole("button", { name: "Approve" });
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(approveRemote).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]?.[0]).toMatchObject({ title: "Approved" });
  });

  it("stops offering approval once the server has recorded it, even if the refetch fails", async () => {
    const { shareId } = createSharedVersion();
    const shared = findVersionByShareId(shareId)!;
    leaveDemoServedByServer(shareId);
    approveRemote.mockResolvedValue({
      ...shared,
      version: { ...shared.version, approvalStamp: { name: "Ivan", surname: "Petrov", email: "ivan@example.com", timestamp: new Date().toISOString() } },
    });

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    fetchRemote.mockRejectedValue(new Error("refetch failed"));
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument());
  });

  it("cannot be dismissed while the approval is in flight", async () => {
    const { shareId } = createSharedVersion();
    leaveDemoServedByServer(shareId);
    approveRemote.mockReturnValue(new Promise(() => {}));

    renderSharePage(shareId);
    await screen.findByRole("button", { name: "Approve" });
    fillAndSubmitStamp();

    const dialog = screen.getByRole("dialog");
    const cancel = Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Cancel");
    expect(cancel).toBeDisabled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sends a real project's share to the server even when this tab's store holds it and demo is on", async () => {
    setAuthRole("owner");
    const created = createVersionSnapshot("real-project-179", "user-1");
    const local = findVersionByShareId(created.shareId);
    expect(local?.projectId).toBe("real-project-179");
    const serverRow = { ...local!, version: { ...local!.version, status: "proposed" as const, submitted: true, archived: false, shareApprovalPolicy: "registered" as const } };
    fetchRemote.mockResolvedValue(serverRow);
    approveRemote.mockResolvedValue(serverRow);

    renderSharePage(created.shareId);
    await screen.findByRole("button", { name: "Approve" });
    fillAndSubmitStamp();

    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(approveRemote).toHaveBeenCalledTimes(1);
    expect(toastSpy.mock.calls[0]?.[0]).toMatchObject({ title: "Approved" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
