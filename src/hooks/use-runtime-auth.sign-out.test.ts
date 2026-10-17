import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

type AuthCallback = (event: string, session: unknown) => void;
const auth = vi.hoisted(() => ({
  callback: null as AuthCallback | null,
  session: { user: { id: "profile-1" } } as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: auth.session }, error: null })),
      onAuthStateChange: vi.fn((callback: AuthCallback) => {
        auth.callback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

// src/test/setup.ts has already loaded the module against the real client.
async function loadRuntimeAuth() {
  vi.resetModules();
  const runtimeAuth = await import("@/hooks/use-runtime-auth");
  runtimeAuth.__unsafeResetRuntimeAuthForTests();
  return runtimeAuth;
}

describe("getSignedOutSince", () => {
  afterEach(() => {
    auth.callback = null;
    auth.session = { user: { id: "profile-1" } };
    vi.useRealTimers();
  });

  it("records when a signed-in session ends, and keeps the first stamp while signed out", async () => {
    const { getSignedOutSince, useRuntimeAuth } = await loadRuntimeAuth();
    const { result } = renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(auth.callback).not.toBeNull());
    expect(result.current.status).toBe("authenticated");
    expect(getSignedOutSince()).toBeNull();

    vi.useFakeTimers();
    vi.setSystemTime(5_000_000);
    auth.callback?.("SIGNED_OUT", null);
    expect(getSignedOutSince()).toBe(5_000_000);

    vi.setSystemTime(6_000_000);
    auth.callback?.("SIGNED_OUT", null);
    expect(getSignedOutSince()).toBe(5_000_000);
  });

  it("forgets the sign-out once someone signs in again", async () => {
    const { getSignedOutSince, useRuntimeAuth } = await loadRuntimeAuth();
    renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(auth.callback).not.toBeNull());

    auth.callback?.("SIGNED_OUT", null);
    expect(getSignedOutSince()).not.toBeNull();
    auth.callback?.("SIGNED_IN", { user: { id: "profile-1" } });
    expect(getSignedOutSince()).toBeNull();
  });

  it("records a session whose re-init fails while nothing was listening", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { getSignedOutSince, useRuntimeAuth } = await loadRuntimeAuth();
    const first = renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(first.result.current.status).toBe("authenticated"));
    first.unmount();

    vi.mocked(supabase.auth.getSession).mockRejectedValueOnce(new Error("network"));
    const second = renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(second.result.current.status).toBe("guest"));
    expect(getSignedOutSince()).not.toBeNull();
  });

  it("records a session that ended while nothing was listening", async () => {
    const { getSignedOutSince, useRuntimeAuth } = await loadRuntimeAuth();
    const first = renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(first.result.current.status).toBe("authenticated"));
    first.unmount();

    auth.session = null;
    const second = renderHook(() => useRuntimeAuth());
    await waitFor(() => expect(second.result.current.status).toBe("guest"));
    expect(getSignedOutSince()).not.toBeNull();
  });
});
