import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const rpcMock = vi.fn();
const deleteWorkMock = vi.fn();
const deleteLineMock = vi.fn();
const hydrateMock = vi.fn();
const flushMock = vi.fn();
const ensureVersionMock = vi.fn();
const ensureStageMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: () => ({ dismiss: vi.fn() }) }),
}));
vi.mock("@/components/ui/toast", () => ({
  ToastAction: () => null,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/data/estimate-v2-store", () => ({
  deleteWork: (...args: unknown[]) => deleteWorkMock(...args),
  deleteLine: (...args: unknown[]) => deleteLineMock(...args),
  ensureRemoteEstimateVersionId: (...args: unknown[]) => ensureVersionMock(...args),
  ensureRemoteStageId: (...args: unknown[]) => ensureStageMock(...args),
  flushProjectDraftSync: (...args: unknown[]) => flushMock(...args),
  hydrateEstimateV2ProjectFromWorkspace: (...args: unknown[]) => hydrateMock(...args),
}));

import { useAddLibraryWork, type AddWorkRequest } from "@/hooks/use-add-library-work";

/** Build an AddWorkRequest with no deselected resources (the common case). */
const req = (templateWorkId: string, uncheckedResourceIndexes: number[] = []): AddWorkRequest => ({
  templateWorkId,
  uncheckedResourceIndexes,
});

describe("useAddLibraryWork", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    deleteWorkMock.mockReset();
    deleteLineMock.mockReset();
    hydrateMock.mockReset().mockResolvedValue(undefined);
    flushMock.mockReset().mockResolvedValue(undefined);
    ensureVersionMock.mockReset().mockResolvedValue("v1");
    ensureStageMock.mockReset().mockImplementation((_p: string, stageId: string) => Promise.resolve(stageId));
  });

  it("adds each work to the target stage, flushing before the RPC, then force-rehydrates", async () => {
    rpcMock.mockResolvedValue({ data: { work_id: "ew1" }, error: null });
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-target", [req("tw1"), req("tw2")]);
    });

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith(
      "add_library_work_to_estimate",
      expect.objectContaining({
        p_estimate_version_id: "v1",
        p_project_stage_id: "ps-target",
        p_template_work_id: "tw1",
      }),
    );
    // The flush must precede the first server mutation (prune-race fix).
    expect(flushMock.mock.invocationCallOrder[0]).toBeLessThan(rpcMock.mock.invocationCallOrder[0]);
    // The target stage is resolved to its live project_stages.id before the RPC.
    expect(ensureStageMock).toHaveBeenCalledWith("p1", "ps-target");
    expect(hydrateMock).toHaveBeenCalledWith("p1", expect.objectContaining({ forceFresh: true }));
  });

  it("bootstraps a server version when none exists, then adds to it", async () => {
    ensureVersionMock.mockReset().mockResolvedValue("v-new");
    rpcMock.mockResolvedValue({ data: { work_id: "ew1" }, error: null });
    const { result } = renderHook(() => useAddLibraryWork("p1", null, "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-target", [req("tw1")]);
    });

    expect(ensureVersionMock).toHaveBeenCalledWith("p1");
    expect(rpcMock).toHaveBeenCalledWith(
      "add_library_work_to_estimate",
      expect.objectContaining({ p_estimate_version_id: "v-new" }),
    );
  });

  it("does nothing without a target stage or works", async () => {
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));
    await act(async () => {
      await result.current.addWorks("", [req("tw1")]);
    });
    await act(async () => {
      await result.current.addWorks("ps-target", []);
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(flushMock).not.toHaveBeenCalled();
  });

  it("does not re-hydrate when every add RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-target", [req("tw1")]);
    });

    expect(hydrateMock).not.toHaveBeenCalled();
    expect(deleteWorkMock).not.toHaveBeenCalled();
  });

  it("resolves a local (not-yet-hydrated) stage id to the live project_stage id before the RPC", async () => {
    ensureStageMock.mockReset().mockResolvedValue("ps-live-uuid");
    rpcMock.mockResolvedValue({ data: { work_id: "ew1" }, error: null });
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("stage-v2-local", [req("tw1")]);
    });

    expect(ensureStageMock).toHaveBeenCalledWith("p1", "stage-v2-local");
    expect(rpcMock).toHaveBeenCalledWith(
      "add_library_work_to_estimate",
      expect.objectContaining({ p_project_stage_id: "ps-live-uuid" }),
    );
  });

  it("does not fire the RPC when the stage cannot be resolved (e.g. demo/local)", async () => {
    ensureStageMock.mockReset().mockResolvedValue(null);
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-x", [req("tw1")]);
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("degrades gracefully (no unhandled rejection, no RPC) when stage resolution throws", async () => {
    ensureStageMock.mockReset().mockRejectedValue(new Error("network blip / ambiguous stage"));
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-x", [req("tw1")]);
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("prunes only the deselected resources (by returned line id) AFTER the hydrate, keeping the rest", async () => {
    rpcMock.mockResolvedValue({
      data: { work_id: "ew1", resource_line_ids: ["rl0", "rl1", "rl2"] },
      error: null,
    });
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      // deselect resources at positions 0 and 2 → keep position 1.
      await result.current.addWorks("ps-target", [req("tw1", [0, 2])]);
    });

    expect(deleteLineMock).toHaveBeenCalledTimes(2);
    expect(deleteLineMock).toHaveBeenCalledWith("p1", "rl0");
    expect(deleteLineMock).toHaveBeenCalledWith("p1", "rl2");
    expect(deleteLineMock).not.toHaveBeenCalledWith("p1", "rl1");
    // The prune runs only once the server lines are in local state.
    expect(hydrateMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteLineMock.mock.invocationCallOrder[0],
    );
  });

  it("ignores out-of-range deselected indexes and prunes nothing when none are deselected", async () => {
    rpcMock.mockResolvedValue({
      data: { work_id: "ew1", resource_line_ids: ["rl0", "rl1"] },
      error: null,
    });
    const { result } = renderHook(() => useAddLibraryWork("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.addWorks("ps-target", [req("tw1", [5]), req("tw2", [])]);
    });

    expect(deleteLineMock).not.toHaveBeenCalled();
  });
});
