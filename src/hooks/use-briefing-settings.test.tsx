import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as briefingSettingsSource from "@/data/briefing-settings-source";
import { briefingSettingsQueryKeys, useBriefingSettings } from "@/hooks/use-briefing-settings";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";

const SAVED: briefingSettingsSource.BriefingSettingsSnapshot = {
  settings: briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
  projects: [{ id: "p1", title: "Ленина 42" }],
  inAnyProject: true,
  mutedProjectIds: [],
};

function setup() {
  let finish!: () => void;
  let refuse!: (reason: Error) => void;
  const source: briefingSettingsSource.BriefingSettingsSource = {
    mode: "supabase",
    load: vi.fn(async () => SAVED),
    saveSettings: vi.fn(() => new Promise<void>((resolve, reject) => {
      finish = resolve;
      refuse = reject;
    })),
    setProjectMuted: vi.fn(async () => {}),
  };
  vi.spyOn(briefingSettingsSource, "getBriefingSettingsSource").mockResolvedValue(source);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const mount = () => renderHook(() => useBriefingSettings(() => {}), { wrapper });
  const view = mount();
  const cached = (profileId: string) =>
    queryClient.getQueryData<briefingSettingsSource.BriefingSettingsSnapshot>(briefingSettingsQueryKeys.snapshot(profileId));
  return { source, view, mount, cached, finish: () => finish(), refuse: () => refuse(new Error("refused")) };
}

describe("useBriefingSettings", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("drops a change asked for while another is still being written, even before the screen has caught up", async () => {
    const { source, view, finish } = setup();
    await waitFor(() => expect(view.result.current.snapshot).toBeDefined());

    act(() => {
      view.result.current.saveSettings({ enabled: false });
      view.result.current.saveSettings({ weekends: true });
      view.result.current.setProjectMuted("p1", true);
    });

    await waitFor(() => expect(view.result.current.isSaving).toBe(true));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(source.saveSettings).toHaveBeenCalledTimes(1);
    expect(source.saveSettings).toHaveBeenCalledWith({ enabled: false });
    expect(source.setProjectMuted).not.toHaveBeenCalled();
    expect(view.result.current.snapshot?.settings).toMatchObject({ enabled: false, weekends: false });

    finish();
    await waitFor(() => expect(view.result.current.isSaving).toBe(false));
    act(() => view.result.current.saveSettings({ weekends: true }));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(2));
  });

  it("still holds the one write after the screen was left and opened again", async () => {
    const { source, view, mount, finish } = setup();
    await waitFor(() => expect(view.result.current.snapshot).toBeDefined());
    act(() => view.result.current.saveSettings({ enabled: false }));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(1));

    view.unmount();
    const back = mount();
    expect(back.result.current.isSaving).toBe(true);
    act(() => back.result.current.saveSettings({ weekends: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(source.saveSettings).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(back.result.current.isSaving).toBe(false));
    act(() => back.result.current.saveSettings({ weekends: true }));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(2));
  });

  it("puts the saved values back when a write is refused after the screen was left", async () => {
    const { source, view, cached, refuse } = setup();
    await waitFor(() => expect(view.result.current.snapshot).toBeDefined());
    act(() => view.result.current.saveSettings({ enabled: false }));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(1));
    expect(cached("profile-1")?.settings.enabled).toBe(false);

    view.unmount();
    refuse();

    await waitFor(() => expect(cached("profile-1")).toEqual(SAVED));
  });

  it("puts a refused write back under the profile it was made for, not the one signed in since", async () => {
    const { source, view, cached, refuse } = setup();
    await waitFor(() => expect(view.result.current.snapshot).toBeDefined());
    act(() => view.result.current.saveSettings({ enabled: false }));
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledTimes(1));

    const other = { ...SAVED, settings: { enabled: true, minute: 1110, weekends: true }, projects: [] };
    vi.mocked(source.load).mockResolvedValue(other);
    act(() => authenticateRuntimeAuth("profile-2"));
    view.rerender();
    await waitFor(() => expect(view.result.current.snapshot).toEqual(other));

    refuse();

    await waitFor(() => expect(cached("profile-1")).toEqual(SAVED));
    expect(cached("profile-2")).toEqual(other);
  });
});
