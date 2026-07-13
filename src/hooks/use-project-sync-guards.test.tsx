import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectSyncGuards } from "@/hooks/use-project-sync-guards";

const { flushMock, hasPendingMock, useWorkspaceModeMock } = vi.hoisted(() => ({
  flushMock: vi.fn(),
  hasPendingMock: vi.fn(),
  useWorkspaceModeMock: vi.fn(),
}));

vi.mock("@/data/estimate-v2-store", async () => {
  const actual = await vi.importActual<typeof import("@/data/estimate-v2-store")>(
    "@/data/estimate-v2-store",
  );
  return {
    ...actual,
    flushProjectDraftSync: flushMock,
    hasPendingProjectDraftSync: hasPendingMock,
  };
});

vi.mock("@/hooks/use-workspace-source", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-workspace-source")>(
    "@/hooks/use-workspace-source",
  );
  return { ...actual, useWorkspaceMode: useWorkspaceModeMock };
});

function Probe({ projectId }: { projectId?: string }) {
  useProjectSyncGuards(projectId);
  return null;
}

function fireVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useProjectSyncGuards", () => {
  beforeEach(() => {
    flushMock.mockReset().mockResolvedValue(undefined);
    hasPendingMock.mockReset().mockReturnValue(false);
    useWorkspaceModeMock.mockReturnValue({ kind: "supabase", profileId: "me" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes the pending draft sync when the tab goes hidden", () => {
    hasPendingMock.mockReturnValue(true);
    const view = render(<Probe projectId="project-1" />);
    fireVisibility("hidden");
    expect(flushMock).toHaveBeenCalledWith("project-1");
    view.unmount();
  });

  it("does not flush when nothing is pending or the tab becomes visible", () => {
    const view = render(<Probe projectId="project-1" />);
    fireVisibility("hidden");
    fireVisibility("visible");
    expect(flushMock).not.toHaveBeenCalled();
    view.unmount();
  });

  it("asks for the native confirm on unload only while a sync is pending", () => {
    hasPendingMock.mockReturnValue(true);
    const view = render(<Probe projectId="project-1" />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    hasPendingMock.mockReturnValue(false);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    view.unmount();
  });

  it("detaches listeners on unmount and outside supabase mode", () => {
    hasPendingMock.mockReturnValue(true);
    const view = render(<Probe projectId="project-1" />);
    view.unmount();
    fireVisibility("hidden");
    expect(flushMock).not.toHaveBeenCalled();

    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    const demo = render(<Probe projectId="project-1" />);
    fireVisibility("hidden");
    expect(flushMock).not.toHaveBeenCalled();
    demo.unmount();
  });
});
