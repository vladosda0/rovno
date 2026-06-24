import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const { rpcRef } = vi.hoisted(() => ({
  rpcRef: { value: { data: null as unknown, error: null as unknown } },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async () => rpcRef.value },
}));

import { useCanonicalCatalog } from "@/hooks/use-canonical-catalog";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useCanonicalCatalog", () => {
  beforeEach(() => {
    rpcRef.value = { data: null, error: null };
  });

  it("maps tree mode (groups -> subcategories) when subcategory is null", async () => {
    rpcRef.value = {
      data: {
        groups: [{ group: "Материалы", subcategories: [{ subcategory: "Сыпучие", leaf_count: 12 }] }],
      },
      error: null,
    };
    const { result } = renderHook(() => useCanonicalCatalog(null, true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      mode: "tree",
      groups: [{ group: "Материалы", subcategories: [{ subcategory: "Сыпучие", leafCount: 12 }] }],
    });
  });

  it("maps drill mode (resources, snake -> camel) when a subcategory is given", async () => {
    rpcRef.value = {
      data: {
        subcategory: "Сыпучие",
        resources: [
          {
            id: "r1",
            name: "Песок",
            default_resource_type: "material",
            unit_display: "м³",
            rovno_sku: "RS-1",
            subcategory: "Сыпучие",
          },
        ],
      },
      error: null,
    };
    const { result } = renderHook(() => useCanonicalCatalog("Сыпучие", true), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      mode: "drill",
      subcategory: "Сыпучие",
      resources: [
        {
          id: "r1",
          name: "Песок",
          defaultResourceType: "material",
          unitDisplay: "м³",
          rovnoSku: "RS-1",
          subcategory: "Сыпучие",
        },
      ],
    });
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useCanonicalCatalog(null, false), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });
});
