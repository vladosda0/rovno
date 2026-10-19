import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BROWSER_ZONE = "Europe/Samara";

const { state, mutateIdentity, browser } = vi.hoisted(() => ({
  browser: { zone: "Europe/Samara" as string | undefined },
  state: {
    mode: { kind: "supabase", profileId: "u1" } as { kind: string; profileId?: string },
    user: { id: "u1", timezone: "UTC" },
    isLoading: false,
  },
  mutateIdentity: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => state.mode,
  useWorkspaceCurrentUserState: () => ({ user: state.user, isLoading: state.isLoading }),
  useUpdateWorkspaceProfileIdentity: () => ({ mutateAsync: mutateIdentity, isPending: false }),
}));

import { useBrowserTimezoneSync } from "@/hooks/use-browser-timezone-sync";

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useBrowserTimezoneSync", () => {
  beforeEach(() => {
    localStorage.clear();
    state.mode = { kind: "supabase", profileId: "u1" };
    state.user = { id: "u1", timezone: "UTC" };
    state.isLoading = false;
    browser.zone = BROWSER_ZONE;
    mutateIdentity.mockReset();
    mutateIdentity.mockImplementation(async (patch: { timezone: string }) => {
      state.user = { ...state.user, timezone: patch.timezone };
      return state.user;
    });
    const real = Intl.DateTimeFormat.prototype.resolvedOptions;
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: browser.zone as string };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(["UTC", "auto", ""])("writes the browser's zone over the unset value %j", async (stored) => {
    state.user = { id: "u1", timezone: stored };
    renderHook(() => useBrowserTimezoneSync());

    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
    expect(mutateIdentity).toHaveBeenCalledWith({ timezone: BROWSER_ZONE });
  });

  it.each(["UTC", "Etc/UTC", "GMT", "Etc/GMT"])(
    "writes Etc/UTC for a browser on %s: a bare UTC in the profile means no zone was chosen",
    async (zone) => {
      browser.zone = zone;
      renderHook(() => useBrowserTimezoneSync());

      await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
      expect(mutateIdentity).toHaveBeenCalledWith({ timezone: "Etc/UTC" });
    },
  );

  it.each(["", "   ", "Etc/Unknown", undefined])(
    "writes nothing when the browser names no zone (%j), and keeps the one write for later",
    async (zone) => {
      browser.zone = zone;
      renderHook(() => useBrowserTimezoneSync());
      await settle();
      expect(mutateIdentity).not.toHaveBeenCalled();
      cleanup();

      browser.zone = BROWSER_ZONE;
      renderHook(() => useBrowserTimezoneSync());
      await waitFor(() => expect(mutateIdentity).toHaveBeenCalledWith({ timezone: BROWSER_ZONE }));
    },
  );

  it("trims the zone before it is written", async () => {
    browser.zone = "  Europe/Samara\n";
    renderHook(() => useBrowserTimezoneSync());

    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledWith({ timezone: BROWSER_ZONE }));
  });

  it("leaves a real UTC alone", async () => {
    browser.zone = "UTC";
    state.user = { id: "u1", timezone: "Etc/UTC" };
    renderHook(() => useBrowserTimezoneSync());

    await settle();
    expect(mutateIdentity).not.toHaveBeenCalled();
  });

  it("leaves a zone the person picked alone", async () => {
    state.user = { id: "u1", timezone: "Europe/Moscow" };
    renderHook(() => useBrowserTimezoneSync());

    await settle();
    expect(mutateIdentity).not.toHaveBeenCalled();
  });

  it("does not write a second time on this device, so a UTC picked afterwards holds", async () => {
    renderHook(() => useBrowserTimezoneSync());
    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
    cleanup();

    state.user = { id: "u1", timezone: "UTC" };
    renderHook(() => useBrowserTimezoneSync());

    await settle();
    expect(mutateIdentity).toHaveBeenCalledTimes(1);
  });

  it("writes again for another profile on the same device", async () => {
    renderHook(() => useBrowserTimezoneSync());
    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
    cleanup();

    state.mode = { kind: "supabase", profileId: "u2" };
    state.user = { id: "u2", timezone: "UTC" };
    renderHook(() => useBrowserTimezoneSync());

    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(2));
  });

  it("tries again on the next visit when the write was refused", async () => {
    mutateIdentity.mockRejectedValueOnce(new Error("refused"));
    renderHook(() => useBrowserTimezoneSync());
    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
    await settle();
    cleanup();

    renderHook(() => useBrowserTimezoneSync());
    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(2));
  });

  it("waits for the profile to load, and for it to be this person's", async () => {
    state.user = { id: "", timezone: "UTC" };
    state.isLoading = true;
    const { rerender } = renderHook(() => useBrowserTimezoneSync());
    await settle();
    expect(mutateIdentity).not.toHaveBeenCalled();

    state.user = { id: "u1", timezone: "UTC" };
    state.isLoading = false;
    rerender();
    await waitFor(() => expect(mutateIdentity).toHaveBeenCalledTimes(1));
  });

  it.each(["", "someone-else"])("writes nothing for a loaded profile whose id is %j, not the signed-in person's", async (id) => {
    state.user = { id, timezone: "UTC" };
    state.isLoading = false;
    renderHook(() => useBrowserTimezoneSync());

    await settle();
    expect(mutateIdentity).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it.each(["demo", "local", "guest", "pending-supabase"])("writes nothing in %s mode", async (kind) => {
    state.mode = { kind };
    renderHook(() => useBrowserTimezoneSync());

    await settle();
    expect(mutateIdentity).not.toHaveBeenCalled();
  });
});
