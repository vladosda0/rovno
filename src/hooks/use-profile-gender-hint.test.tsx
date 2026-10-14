import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, rpcMock } = vi.hoisted(() => ({
  state: { mode: { kind: "supabase", profileId: "u1" } as { kind: string; profileId?: string } },
  rpcMock: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => state.mode,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

import { useProfileGenderHint } from "@/hooks/use-profile-gender-hint";
import { shurikMessagesQueryKeys } from "@/hooks/use-shurik-messages";
import { isProfileGenderHintSettled, requestProfileGenderHint } from "@/data/profile-gender-hint-source";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useProfileGenderHint", () => {
  beforeEach(() => {
    localStorage.clear();
    state.mode = { kind: "supabase", profileId: "u1" };
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: "asked", error: null });
  });
  afterEach(() => {
    cleanup();
  });

  it("asks the server once, from the app, not as the onboarding step", async () => {
    const { wrapper } = setup();
    const { rerender } = renderHook(() => useProfileGenderHint(), { wrapper });
    rerender();
    await settle();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("profile_gender_hint", { p_onboarding: false });
  });

  it("reloads Shurik's messages when the hint was written", async () => {
    rpcMock.mockResolvedValue({ data: "written", error: null });
    const { wrapper, invalidate } = setup();
    renderHook(() => useProfileGenderHint(), { wrapper });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: shurikMessagesQueryKeys.list("u1") }),
    );
    expect(isProfileGenderHintSettled("u1")).toBe(true);
  });

  it("does not reload the messages when nothing was written", async () => {
    const { wrapper, invalidate } = setup();
    renderHook(() => useProfileGenderHint(), { wrapper });
    await settle();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("never asks again on this device once the server has answered for good", async () => {
    const first = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: first.wrapper });
    await settle();
    cleanup();

    const second = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: second.wrapper });
    await settle();

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("asks again on the next visit when the person had no name yet", async () => {
    rpcMock.mockResolvedValue({ data: "skipped", error: null });
    const first = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: first.wrapper });
    await settle();
    cleanup();

    const second = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: second.wrapper });
    await settle();

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(isProfileGenderHintSettled("u1")).toBe(false);
  });

  it("asks again on the next visit when the call failed", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "network" } });
    const first = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: first.wrapper });
    await settle();
    cleanup();

    const second = setup();
    renderHook(() => useProfileGenderHint(), { wrapper: second.wrapper });
    await settle();

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(isProfileGenderHintSettled("u1")).toBe(false);
  });

  it.each(["demo", "local", "guest"])("does nothing in the %s workspace", async (kind) => {
    state.mode = { kind };
    const { wrapper } = setup();
    renderHook(() => useProfileGenderHint(), { wrapper });
    await settle();

    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("requestProfileGenderHint", () => {
  beforeEach(() => {
    localStorage.clear();
    rpcMock.mockReset();
  });

  it("rejects an answer the server does not give", async () => {
    rpcMock.mockResolvedValue({ data: "maybe", error: null });

    await expect(requestProfileGenderHint("u1", { onboarding: true })).rejects.toThrow(/profile_gender_hint/);
    expect(isProfileGenderHintSettled("u1")).toBe(false);
  });

  it("settles the person after the onboarding step records them", async () => {
    rpcMock.mockResolvedValue({ data: "asked", error: null });

    await expect(requestProfileGenderHint("u1", { onboarding: true })).resolves.toBe("asked");
    expect(rpcMock).toHaveBeenCalledWith("profile_gender_hint", { p_onboarding: true });
    expect(isProfileGenderHintSettled("u1")).toBe(true);
    expect(isProfileGenderHintSettled("u2")).toBe(false);
  });
});
