import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const rpcMock = vi.fn();
const deleteWorkMock = vi.fn();
const hydrateMock = vi.fn();
const flushMock = vi.fn();
const ensureVersionMock = vi.fn();

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
  deleteStage: vi.fn(),
  deleteWork: (...args: unknown[]) => deleteWorkMock(...args),
  getEstimateV2ProjectState: vi.fn(),
  ensureRemoteEstimateVersionId: (...args: unknown[]) => ensureVersionMock(...args),
  flushProjectDraftSync: (...args: unknown[]) => flushMock(...args),
  hydrateEstimateV2ProjectFromWorkspace: (...args: unknown[]) => hydrateMock(...args),
}));

import { useApplyTemplateStages, type StageApplySelection } from "@/hooks/use-apply-template-stages";

describe("useApplyTemplateStages partial-stage prune", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    deleteWorkMock.mockReset();
    hydrateMock.mockReset().mockResolvedValue(undefined);
    flushMock.mockReset().mockResolvedValue(undefined);
    ensureVersionMock.mockReset().mockResolvedValue("v1");
  });

  it("prunes the unchecked work by position, even when two works share an article id", async () => {
    // RPC returns one estimate_work id per template work, in browse-tree order.
    rpcMock.mockResolvedValue({
      data: { project_stage_id: "ps1", work_ids: ["ew1", "ew2", "ew3"] },
      error: null,
    });
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    // tw1 and tw2 deliberately collide on article id; only tw2 is unchecked.
    const selection: StageApplySelection = {
      templateStageId: "ts1",
      stageTitle: "Фундамент",
      orderedTemplateWorkIds: ["tw1", "tw2", "tw3"],
      uncheckedTemplateWorkIds: ["tw2"],
    };

    await act(async () => {
      await result.current.applyStages([selection]);
    });

    expect(hydrateMock).toHaveBeenCalledTimes(1);
    // Exactly the estimate_work at tw2's position is deleted; the kept sibling ew1 survives.
    expect(deleteWorkMock).toHaveBeenCalledTimes(1);
    expect(deleteWorkMock).toHaveBeenCalledWith("p1", "ew2");
  });

  it("deletes nothing when the whole stage is kept (no unchecked works)", async () => {
    rpcMock.mockResolvedValue({
      data: { project_stage_id: "ps1", work_ids: ["ew1", "ew2"] },
      error: null,
    });
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.applyStages([
        {
          templateStageId: "ts1",
          stageTitle: "Фундамент",
          orderedTemplateWorkIds: ["tw1", "tw2"],
          uncheckedTemplateWorkIds: [],
        },
      ]);
    });

    expect(deleteWorkMock).not.toHaveBeenCalled();
  });

  it("skips the prune when returned work_ids don't line up with the browse-tree works", async () => {
    // Cached tree drifted from the template: 3 works browsed, only 2 ids returned.
    rpcMock.mockResolvedValue({
      data: { project_stage_id: "ps1", work_ids: ["ew1", "ew2"] },
      error: null,
    });
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.applyStages([
        {
          templateStageId: "ts1",
          stageTitle: "Фундамент",
          orderedTemplateWorkIds: ["tw1", "tw2", "tw3"],
          uncheckedTemplateWorkIds: ["tw2"],
        },
      ]);
    });

    // A misaligned index could delete the wrong row; we'd rather keep the extra work.
    expect(deleteWorkMock).not.toHaveBeenCalled();
  });

  it("flushes the pending autosave before forcing a fresh re-hydrate (race fix)", async () => {
    rpcMock.mockResolvedValue({ data: { project_stage_id: "ps1", work_ids: ["ew1"] }, error: null });
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.applyStages([
        { templateStageId: "ts1", stageTitle: "Фундамент", orderedTemplateWorkIds: ["tw1"], uncheckedTemplateWorkIds: [] },
      ]);
    });

    expect(flushMock).toHaveBeenCalledWith("p1");
    expect(hydrateMock).toHaveBeenCalledWith("p1", expect.objectContaining({ forceFresh: true }));
    // flush MUST run before the forced re-hydrate so the autosave prune can't race the apply.
    expect(flushMock.mock.invocationCallOrder[0]).toBeLessThan(hydrateMock.mock.invocationCallOrder[0]);
  });

  it("does not prune or throw when the post-apply refresh fails (rows already committed)", async () => {
    rpcMock.mockResolvedValue({ data: { project_stage_id: "ps1", work_ids: ["ew1", "ew2"] }, error: null });
    hydrateMock.mockReset().mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    // Must resolve (not reject) so the caller can clear its selection — a re-apply of
    // the non-idempotent RPC would double-insert.
    await act(async () => {
      await result.current.applyStages([
        { templateStageId: "ts1", stageTitle: "Фундамент", orderedTemplateWorkIds: ["tw1", "tw2"], uncheckedTemplateWorkIds: ["tw2"] },
      ]);
    });

    expect(deleteWorkMock).not.toHaveBeenCalled();
  });

  it("flushes the pending autosave BEFORE issuing the apply RPC (prune-race fix)", async () => {
    rpcMock.mockResolvedValue({ data: { project_stage_id: "ps1", work_ids: ["ew1"] }, error: null });
    const { result } = renderHook(() => useApplyTemplateStages("p1", "v1", "prof1"));

    await act(async () => {
      await result.current.applyStages([
        { templateStageId: "ts1", stageTitle: "Фундамент", orderedTemplateWorkIds: ["tw1"], uncheckedTemplateWorkIds: [] },
      ]);
    });

    // The flush must precede the server mutation so a mid-apply autosave prune can't delete
    // the rows we're inserting.
    expect(flushMock.mock.invocationCallOrder[0]).toBeLessThan(rpcMock.mock.invocationCallOrder[0]);
  });

  it("bootstraps a server estimate version when none exists, then applies to it", async () => {
    ensureVersionMock.mockReset().mockResolvedValue("v-new");
    rpcMock.mockResolvedValue({ data: { project_stage_id: "ps1", work_ids: ["ew1"] }, error: null });
    const { result } = renderHook(() => useApplyTemplateStages("p1", null, "prof1"));

    await act(async () => {
      await result.current.applyStages([
        { templateStageId: "ts1", stageTitle: "Фундамент", orderedTemplateWorkIds: ["tw1"], uncheckedTemplateWorkIds: [] },
      ]);
    });

    expect(ensureVersionMock).toHaveBeenCalledWith("p1");
    // The bootstrapped version id (not the null prop) is used for the apply RPC.
    expect(rpcMock).toHaveBeenCalledWith(
      "apply_template_stage_to_estimate",
      expect.objectContaining({ p_estimate_version_id: "v-new" }),
    );
  });

  it("does not call the apply RPC when bootstrap can't create a version (demo/local)", async () => {
    ensureVersionMock.mockReset().mockResolvedValue(null);
    const { result } = renderHook(() => useApplyTemplateStages("p1", null, "prof1"));

    await act(async () => {
      await result.current.applyStages([
        { templateStageId: "ts1", stageTitle: "Фундамент", orderedTemplateWorkIds: ["tw1"], uncheckedTemplateWorkIds: [] },
      ]);
    });

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
