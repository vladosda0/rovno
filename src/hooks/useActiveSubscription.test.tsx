import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";

const { maybeSingleMock, authState } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  authState: { status: "authenticated", profileId: "profile-1" as string | null },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: maybeSingleMock }),
      }),
    }),
  },
}));

vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => authState,
}));

import { useActiveSubscription } from "@/hooks/useActiveSubscription";

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useActiveSubscription before the first successful read", () => {
  let client: QueryClient;

  beforeEach(() => {
    maybeSingleMock.mockReset();
    authState.status = "authenticated";
    authState.profileId = "profile-1";
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
    client.clear();
  });

  it("reports loading, not a free user, while the first read is paused offline", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    onlineManager.setOnline(false);

    const { result } = renderHook(() => useActiveSubscription(), { wrapper: wrapperFor(client) });

    await waitFor(() => {
      expect(client.getQueryState(["active-subscription", "profile-1"])?.fetchStatus).toBe("paused");
    });
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(result.current.subscription).toBeNull();
  });

  it("reports loading while a retry after a load error is paused offline", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const { result } = renderHook(() => useActiveSubscription(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.isLoadingError).toBe(true));
    expect(result.current.isLoading).toBe(false);

    onlineManager.setOnline(false);
    act(() => result.current.refetch());

    await waitFor(() => {
      expect(client.getQueryState(["active-subscription", "profile-1"])?.fetchStatus).toBe("paused");
    });
    expect(result.current.isLoadingError).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("stops loading once a read returns no subscription", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useActiveSubscription(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.status).toBe("none");
    expect(result.current.isError).toBe(false);
  });

  it("does not report loading for a guest, whose subscription is never read", () => {
    authState.status = "guest";
    authState.profileId = null;

    const { result } = renderHook(() => useActiveSubscription(), { wrapper: wrapperFor(client) });

    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.status).toBe("none");
  });
});
