import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useDocumentShares } from "@/hooks/use-document-shares";

const { mockMode, mockList } = vi.hoisted(() => ({
  mockMode: { current: { kind: "supabase", profileId: "profile-1" } as { kind: string; profileId?: string } },
  mockList: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => mockMode.current,
}));

vi.mock("@/data/document-share-source", () => ({
  listDocumentShares: mockList,
  createDocumentShare: vi.fn(),
  revokeDocumentShare: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useDocumentShares lastSettledAt", () => {
  it("is 0 before the first read settles and the read time after it", async () => {
    mockMode.current = { kind: "supabase", profileId: "profile-1" };
    let resolve: (value: unknown[]) => void = () => {};
    mockList.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const before = Date.now();
    const { result } = renderHook(() => useDocumentShares("project-1"), { wrapper });

    expect(result.current.lastSettledAt).toBe(0);
    resolve([]);
    await waitFor(() => expect(result.current.lastSettledAt).toBeGreaterThanOrEqual(before));
  });

  it("counts a failed read as settled", async () => {
    mockMode.current = { kind: "supabase", profileId: "profile-1" };
    mockList.mockRejectedValueOnce(new Error("boom"));
    const before = Date.now();
    const { result } = renderHook(() => useDocumentShares("project-1"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.lastSettledAt).toBeGreaterThanOrEqual(before);
  });

  it("has nothing to wait for when the query is disabled", () => {
    mockMode.current = { kind: "supabase", profileId: "profile-1" };
    const { result } = renderHook(() => useDocumentShares("project-1", { enabled: false }), { wrapper });
    expect(result.current.lastSettledAt).toBe(Number.POSITIVE_INFINITY);
  });
});
