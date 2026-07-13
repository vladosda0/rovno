import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectSyncEventRow } from "@/lib/project-sync-events";
import { useProjectRealtimeInvalidation } from "@/hooks/use-project-realtime-invalidation";

const {
  subscribeMock,
  unsubscribeMock,
  useWorkspaceModeMock,
  getEstimateV2ProjectStateMock,
  hydrateMock,
  hasPendingMock,
} = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
  useWorkspaceModeMock: vi.fn(),
  getEstimateV2ProjectStateMock: vi.fn(),
  hydrateMock: vi.fn(),
  hasPendingMock: vi.fn(),
}));

vi.mock("@/lib/project-sync-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-sync-events")>(
    "@/lib/project-sync-events",
  );
  return { ...actual, subscribeToProjectSyncEvents: subscribeMock };
});

vi.mock("@/hooks/use-workspace-source", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-workspace-source")>(
    "@/hooks/use-workspace-source",
  );
  return { ...actual, useWorkspaceMode: useWorkspaceModeMock };
});

vi.mock("@/data/estimate-v2-store", async () => {
  const actual = await vi.importActual<typeof import("@/data/estimate-v2-store")>(
    "@/data/estimate-v2-store",
  );
  return {
    ...actual,
    getEstimateV2ProjectState: getEstimateV2ProjectStateMock,
    hydrateEstimateV2ProjectFromWorkspace: hydrateMock,
    hasPendingProjectDraftSync: hasPendingMock,
  };
});

function Probe({ projectId }: { projectId: string }) {
  useProjectRealtimeInvalidation(projectId);
  return null;
}

function event(partial: Partial<ProjectSyncEventRow>): ProjectSyncEventRow {
  return {
    id: 1,
    project_id: "project-1",
    kind: "tasks",
    revision: null,
    actor_profile_id: "other-actor",
    created_at: "2026-07-13T00:00:00.000Z",
    ...partial,
  };
}

describe("useProjectRealtimeInvalidation", () => {
  let queryClient: QueryClient;
  let invalidated: unknown[][];
  let onEvents: ((events: ProjectSyncEventRow[]) => void) | null;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidated = [];
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async (filters) => {
      invalidated.push((filters as { queryKey: unknown[] }).queryKey);
    });
    onEvents = null;
    subscribeMock.mockReset().mockImplementation((options: {
      onEvents: (events: ProjectSyncEventRow[]) => void;
    }) => {
      onEvents = options.onEvents;
      return unsubscribeMock;
    });
    unsubscribeMock.mockReset();
    hydrateMock.mockReset().mockResolvedValue(undefined);
    hasPendingMock.mockReset().mockReturnValue(false);
    useWorkspaceModeMock.mockReturnValue({ kind: "supabase", profileId: "me" });
    getEstimateV2ProjectStateMock.mockReturnValue({ sync: { estimateRevision: "rev-local" } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mount = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <Probe projectId="project-1" />
      </QueryClientProvider>,
    );

  // Per-kind isolation: each kind is fired ALONE and the exact invalidated key
  // set is asserted, so a cross-wired or dropped branch fails (a union-of-keys
  // assertion over a mixed batch would let both survive).
  const cases: Array<{ kind: ProjectSyncEventRow["kind"]; keys: string[] }> = [
    { kind: "tasks", keys: ["planning/project-stages/me/project-1", "planning/project-tasks/me/project-1"] },
    { kind: "checklist", keys: ["planning/project-stages/me/project-1", "planning/project-tasks/me/project-1"] },
    { kind: "procurement", keys: ["procurement/project-items/me/project-1"] },
    { kind: "hr", keys: ["hr/project-items/me/project-1", "hr/project-payments/me/project-1"] },
    { kind: "hr_payments", keys: ["hr/project-items/me/project-1", "hr/project-payments/me/project-1"] },
    { kind: "members", keys: ["workspace/project-members/me/project-1"] },
  ];
  it.each(cases)("maps '$kind' to exactly its query roots and nothing else", ({ kind, keys }) => {
    const view = mount();
    act(() => {
      onEvents?.([event({ id: 1, kind })]);
    });
    expect(new Set(invalidated.map((key) => key.join("/")))).toEqual(new Set(keys));
    expect(hydrateMock).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it("projection events invalidate all domains and trigger a non-forced hydrate", () => {
    const view = mount();
    act(() => {
      onEvents?.([event({ id: 5, kind: "projection", revision: "rev-remote" })]);
    });
    expect(hydrateMock).toHaveBeenCalledWith("project-1", { profileId: "me" });
    expect(invalidated.length).toBeGreaterThanOrEqual(5);
    view.unmount();
  });

  it("estimate_draft events invalidate all domains and hydrate (revision mismatch)", () => {
    const view = mount();
    act(() => {
      onEvents?.([event({ id: 8, kind: "estimate_draft", revision: "rev-remote" })]);
    });
    expect(hydrateMock).toHaveBeenCalledWith("project-1", { profileId: "me" });
    const flattened = new Set(invalidated.map((key) => key.join("/")));
    expect(flattened).toContain("procurement/project-items/me/project-1");
    expect(flattened).toContain("hr/project-payments/me/project-1");
    view.unmount();
  });

  it("does NOT hydrate on a remote estimate event while a local draft sync is pending", () => {
    hasPendingMock.mockReturnValue(true);
    const view = mount();
    act(() => {
      onEvents?.([event({ id: 9, kind: "projection", revision: "rev-remote" })]);
    });
    // Queries still invalidate, but the pending save owns convergence via its
    // own CAS — a hydrate here would race and could revert the in-flight edit.
    expect(invalidated.length).toBeGreaterThanOrEqual(5);
    expect(hydrateMock).not.toHaveBeenCalled();
    view.unmount();
  });

  it("skips self-echo: matching revision for estimate kinds, own actor for domain kinds", () => {
    const view = mount();
    act(() => {
      onEvents?.([
        // This tab's own projection (content revision matches local state).
        event({ id: 6, kind: "projection", revision: "rev-local" }),
        // This profile's own direct write.
        event({ id: 7, kind: "tasks", actor_profile_id: "me" }),
      ]);
    });
    expect(invalidated).toEqual([]);
    expect(hydrateMock).not.toHaveBeenCalled();
    view.unmount();
  });

  it("stays inactive outside supabase mode", () => {
    useWorkspaceModeMock.mockReturnValue({ kind: "demo" });
    const view = mount();
    expect(subscribeMock).not.toHaveBeenCalled();
    view.unmount();
  });
});
