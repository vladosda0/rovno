import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getProfilePreferences = vi.fn();

vi.mock("@/data/workspace-source", () => ({
  getWorkspaceSource: async () => ({ getProfilePreferences }),
  hasSupabaseWorkspaceConfig: () => false,
  isSupabaseWorkspaceRequested: () => false,
}));
vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ status: "anonymous", profileId: null }),
}));

import { useWorkspaceProfilePreferencesState } from "@/hooks/use-workspace-source";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useWorkspaceProfilePreferencesState", () => {
  it("reports a failed load and recovers on refetch", async () => {
    getProfilePreferences.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useWorkspaceProfilePreferencesState(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.preferences).toBeUndefined();

    let answer: (value: unknown) => void = () => {};
    getProfilePreferences.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    result.current.refetch();
    await waitFor(() => expect(result.current.isRefetching).toBe(true));
    answer({ currency: "USD" });
    await waitFor(() => expect(result.current.isError).toBe(false));
    await waitFor(() => expect(result.current.isRefetching).toBe(false));
    expect(result.current.preferences).toEqual({ currency: "USD" });
  });
});
