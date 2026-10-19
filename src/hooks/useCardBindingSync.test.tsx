import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const syncCardBinding = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/card-binding-sync", () => ({
  syncCardBinding: () => syncCardBinding(),
}));

const auth = { status: "authenticated", profileId: "profile-1" as string | null };
vi.mock("@/hooks/use-runtime-auth", () => ({
  useRuntimeAuth: () => ({ ...auth }),
}));

import { useCardBindingSync } from "@/hooks/useCardBindingSync";

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useCardBindingSync", () => {
  beforeEach(() => {
    syncCardBinding.mockReset();
    auth.status = "authenticated";
    auth.profileId = "profile-1";
  });

  it("asks the bank once on mount and calls back when the card changed", async () => {
    syncCardBinding.mockResolvedValue(true);
    const onChanged = vi.fn();

    const { rerender } = renderHook(() => useCardBindingSync(onChanged));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    rerender();
    await flush();
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing changed", async () => {
    syncCardBinding.mockResolvedValue(false);
    const onChanged = vi.fn();

    renderHook(() => useCardBindingSync(onChanged));
    await waitFor(() => expect(syncCardBinding).toHaveBeenCalledTimes(1));
    await flush();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("does not call back before the bank has answered", async () => {
    let resolve: (changed: boolean) => void = () => {};
    syncCardBinding.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    const onChanged = vi.fn();

    renderHook(() => useCardBindingSync(onChanged));
    await flush();
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();

    resolve(true);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("does not call back after unmount", async () => {
    let resolve: (changed: boolean) => void = () => {};
    syncCardBinding.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    const onChanged = vi.fn();

    const { unmount } = renderHook(() => useCardBindingSync(onChanged));
    unmount();
    resolve(true);
    await flush();

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("never syncs for a guest or while the session is loading", async () => {
    syncCardBinding.mockResolvedValue(true);
    const onChanged = vi.fn();
    for (const state of [
      { status: "guest", profileId: null },
      { status: "loading", profileId: null },
      { status: "authenticated", profileId: null },
    ]) {
      Object.assign(auth, state);
      const { unmount } = renderHook(() => useCardBindingSync(onChanged));
      await flush();
      unmount();
    }
    expect(syncCardBinding).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("asks again when the signed-in profile changes", async () => {
    syncCardBinding.mockResolvedValue(true);
    const onChanged = vi.fn();

    const { rerender } = renderHook(() => useCardBindingSync(onChanged));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    auth.profileId = "profile-2";
    rerender();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
    expect(syncCardBinding).toHaveBeenCalledTimes(2);
  });

  it("syncs once the session turns out to be signed in", async () => {
    syncCardBinding.mockResolvedValue(true);
    Object.assign(auth, { status: "loading", profileId: null });
    const onChanged = vi.fn();

    const { rerender } = renderHook(() => useCardBindingSync(onChanged));
    await flush();
    expect(syncCardBinding).not.toHaveBeenCalled();

    Object.assign(auth, { status: "authenticated", profileId: "profile-1" });
    rerender();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(syncCardBinding).toHaveBeenCalledTimes(1);
  });

  it("a new callback does not run the check again, and it is the one that gets called", async () => {
    let resolve: (changed: boolean) => void = () => {};
    syncCardBinding.mockReturnValue(new Promise<boolean>((r) => { resolve = r; }));
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(({ cb }) => useCardBindingSync(cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });
    expect(syncCardBinding).toHaveBeenCalledTimes(1);

    resolve(true);
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });
});
