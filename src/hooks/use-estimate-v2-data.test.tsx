import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";

const { useWorkspaceModeMock, hydrateMock, captureExceptionMock } = vi.hoisted(() => ({
  useWorkspaceModeMock: vi.fn(),
  hydrateMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/observability/sentry", () => ({ captureException: captureExceptionMock }));

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
  return { ...actual, hydrateEstimateV2ProjectFromWorkspace: hydrateMock };
});

describe("useEstimateV2Project hydrate on mount", () => {
  beforeEach(() => {
    hydrateMock.mockReset();
    captureExceptionMock.mockReset();
    useWorkspaceModeMock.mockReturnValue({ kind: "supabase", profileId: "me" });
  });

  it("reports a failed hydrate and still ends the loading state", async () => {
    const failure = { code: "PGRST303", message: "JWT expired" };
    hydrateMock.mockRejectedValue(failure);

    const { result } = renderHook(() => useEstimateV2Project("project-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock).toHaveBeenCalledWith(failure, {
      tags: { source: "estimate-hydrate", trigger: "mount" },
    });
  });

  it("reports nothing when the hydrate succeeds", async () => {
    hydrateMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useEstimateV2Project("project-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });
});
