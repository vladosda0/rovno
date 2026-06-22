import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const { estimatesRef, versionsRef } = vi.hoisted(() => ({
  estimatesRef: { value: { data: [] as Array<{ id: string }>, error: null as unknown } },
  versionsRef: { value: { data: [] as Array<{ id: string }>, error: null as unknown } },
}));

// Minimal chainable PostgREST stub: .select()/.eq() return the same builder; awaiting it
// resolves to { data, error } from the per-table ref the test configures.
vi.mock("@/integrations/supabase/client", () => {
  const builder = (ref: { value: unknown }) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(ref.value).then(onFulfilled, onRejected),
    };
    return b;
  };
  return {
    supabase: {
      from: (table: string) => builder(table === "project_estimates" ? estimatesRef : versionsRef),
    },
  };
});

import { useCurrentEstimateVersionId } from "@/hooks/use-current-estimate-version";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe("useCurrentEstimateVersionId", () => {
  beforeEach(() => {
    estimatesRef.value = { data: [{ id: "e1" }], error: null };
    versionsRef.value = { data: [{ id: "v1" }], error: null };
  });

  it("resolves the current version id for a single estimate root", async () => {
    const { result } = renderHook(() => useCurrentEstimateVersionId("p1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("v1");
  });

  it("returns null when the project has no estimate root", async () => {
    estimatesRef.value = { data: [], error: null };
    const { result } = renderHook(() => useCurrentEstimateVersionId("p1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("throws instead of silently picking one when the project has duplicate estimate roots", async () => {
    estimatesRef.value = { data: [{ id: "e1" }, { id: "e2" }], error: null };
    const { result } = renderHook(() => useCurrentEstimateVersionId("p1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      expect.objectContaining({ message: expect.stringContaining("Multiple estimate roots") }),
    );
  });

  it("throws when an estimate has multiple current versions", async () => {
    versionsRef.value = { data: [{ id: "v1" }, { id: "v2" }], error: null };
    const { result } = renderHook(() => useCurrentEstimateVersionId("p1"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(
      expect.objectContaining({ message: expect.stringContaining("Multiple current versions") }),
    );
  });
});
