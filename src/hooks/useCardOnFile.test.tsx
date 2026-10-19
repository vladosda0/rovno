import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ status: "authenticated", profileId: "profile-1" }),
}));

import { useCardOnFile } from "@/hooks/useCardOnFile";

function setup() {
  const onError = vi.fn();
  const client = new QueryClient({ queryCache: new QueryCache({ onError }) });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { onError, ...renderHook(() => useCardOnFile(), { wrapper }) };
}

describe("useCardOnFile", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("keeps the card on screen when a reread fails", async () => {
    rpc.mockResolvedValueOnce({ data: [{ last4: "4242", brand: "Visa" }], error: null });
    const { result, onError } = setup();
    await waitFor(() => expect(result.current.data).toEqual({ last4: "4242", brand: "Visa" }));

    rpc.mockResolvedValueOnce({ data: null, error: { message: "upstream 503" } });
    const reread = await result.current.refetch();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(reread.data).toEqual({ last4: "4242", brand: "Visa" });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data).toEqual({ last4: "4242", brand: "Visa" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows no card and surfaces nothing when the first read fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "function not found" } });
    const { result, onError } = setup();

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops the card when a successful reread says there is none", async () => {
    rpc.mockResolvedValueOnce({ data: [{ last4: "4242", brand: null }], error: null });
    const { result } = setup();
    await waitFor(() => expect(result.current.data).toEqual({ last4: "4242", brand: null }));

    rpc.mockResolvedValueOnce({ data: [], error: null });
    const reread = await result.current.refetch();

    expect(reread.data).toBeNull();
    await waitFor(() => expect(result.current.data).toBeNull());
  });
});
