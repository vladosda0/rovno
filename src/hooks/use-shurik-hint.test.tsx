import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hintSource from "@/data/shurik-hint-source";
import { readShurikHintOfDay } from "@/data/shurik-hint-source";
import { useShurikHintOfDay } from "@/hooks/use-shurik-hint";
import type { ShurikHintOfDay } from "@/lib/shurik-hints";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";

const ACTIVE: ShurikHintOfDay = {
  day: "2026-10-15",
  hint_key: "T01",
  level: 1,
  params: {},
  status: "active",
};

function mount(projectId: string | null, answer: ShurikHintOfDay | null = ACTIVE) {
  const fetch = vi.spyOn(hintSource, "fetchShurikHintOfDay").mockResolvedValue(answer);
  const dismiss = vi.spyOn(hintSource, "dismissShurikHint").mockResolvedValue();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useShurikHintOfDay(projectId), { wrapper });
  return { fetch, dismiss, view };
}

describe("useShurikHintOfDay", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks the server for this project's hint of the day", async () => {
    const { fetch, view } = mount("p1");
    await waitFor(() => expect(view.result.current.hint).toEqual(ACTIVE));
    expect(fetch).toHaveBeenCalledWith("p1");
  });

  it("asks nothing outside a project", async () => {
    const { fetch, view } = mount(null);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(view.result.current.hint).toBeNull();
  });

  it("hides the card at once on the cross and closes it on the server", async () => {
    const { dismiss, view } = mount("p1");
    await waitFor(() => expect(view.result.current.hint).not.toBeNull());
    act(() => view.result.current.dismiss());
    await waitFor(() => expect(view.result.current.hint).toBeNull());
    expect(dismiss).toHaveBeenCalledWith("p1");
  });

  it("keeps a hint the server already marked closed off the screen", async () => {
    const { view, fetch } = mount("p1", { ...ACTIVE, status: "dismissed" });
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(view.result.current.hint).toBeNull();
  });
});

describe("readShurikHintOfDay", () => {
  it("reads the contract's answer", () => {
    expect(
      readShurikHintOfDay({ day: "2026-10-15", hint_key: "T20", level: 2, params: { task_id: "t" }, status: "done" }),
    ).toEqual({ day: "2026-10-15", hint_key: "T20", level: 2, params: { task_id: "t" }, status: "done" });
  });

  it("reads null and anything malformed as no hint", () => {
    expect(readShurikHintOfDay(null)).toBeNull();
    expect(readShurikHintOfDay({ hint_key: "T20", status: "maybe" })).toBeNull();
    expect(readShurikHintOfDay({ status: "active" })).toBeNull();
    expect(readShurikHintOfDay([])).toBeNull();
  });
});
