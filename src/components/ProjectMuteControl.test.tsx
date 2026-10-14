import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectMuteBell, ProjectMuteRow } from "@/components/ProjectMuteControl";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";
import * as briefingSettingsSource from "@/data/briefing-settings-source";
import * as telegramDeliverySource from "@/data/telegram-delivery-source";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";
import { authenticateRuntimeAuth, guestRuntimeAuth, loadingRuntimeAuth } from "@/test/runtime-auth";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const LABEL = "Do not disturb for this project";
const HINT =
  "The briefing, tips and messages from people on “Ленина 42” will stop coming to you. Other members keep getting them as before.";

/** An in-memory stand-in for `notification_project_mutes`: a reload reads what the writes left. */
function createFakeBackend(initial: { mutedProjectIds?: string[]; projects?: briefingSettingsSource.BriefingProject[] } = {}) {
  let muted = [...(initial.mutedProjectIds ?? [])];
  const source: briefingSettingsSource.BriefingSettingsSource = {
    mode: "supabase",
    load: vi.fn(async () => ({
      settings: briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
      // A mere member: the briefing is not theirs to set up, the project is still theirs to silence.
      projects: initial.projects ?? [],
      inAnyProject: true,
      mutedProjectIds: [...muted],
      peopleEnabled: true,
      hintsChatEnabled: true,
    })),
    saveSettings: vi.fn(async () => {}),
    setPeopleEnabled: vi.fn(async () => {}),
    setHintsChatEnabled: vi.fn(async () => {}),
    setProjectMuted: vi.fn(async (projectId: string, isMuted: boolean) => {
      muted = isMuted ? [...muted.filter((id) => id !== projectId), projectId] : muted.filter((id) => id !== projectId);
    }),
  };
  vi.spyOn(briefingSettingsSource, "getBriefingSettingsSource").mockResolvedValue(source);
  return { source, muted: () => [...muted] };
}

function renderWith(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const bell = () => screen.findByRole("button", { name: "Project notifications" });
const mutedBell = () => screen.findByRole("button", { name: "Do not disturb is on" });
const muteSwitch = () => screen.getByRole("switch", { name: LABEL });

describe("ProjectMuteBell", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
    vi.mocked(toast).mockClear();
    vi.spyOn(telegramDeliverySource, "getTelegramDeliverySource").mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    clearDemoSession();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("opens a switch that is off for a project that is not silenced, with what it means", async () => {
    createFakeBackend();
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);

    const button = await bell();
    expect(button).toHaveAttribute("data-muted", "false");
    fireEvent.click(button);

    expect(muteSwitch()).not.toBeChecked();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it("writes the mute at once and shows it on the bell, for a person who is only a member", async () => {
    const { source, muted } = createFakeBackend();
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);

    fireEvent.click(await bell());
    fireEvent.click(muteSwitch());

    await waitFor(() => expect(source.setProjectMuted).toHaveBeenCalledWith("p1", true));
    expect(await mutedBell()).toHaveAttribute("data-muted", "true");
    expect(muteSwitch()).toBeChecked();
    expect(muted()).toEqual(["p1"]);
  });

  it("shows a silenced project as silenced without being opened, and takes the mute off", async () => {
    const { source, muted } = createFakeBackend({ mutedProjectIds: ["p1", "p2"] });
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);

    fireEvent.click(await mutedBell());
    expect(muteSwitch()).toBeChecked();
    fireEvent.click(muteSwitch());

    await waitFor(() => expect(source.setProjectMuted).toHaveBeenCalledWith("p1", false));
    expect(await bell()).toHaveAttribute("data-muted", "false");
    expect(muted()).toEqual(["p2"]);
  });

  it("puts the switch back and says so when the write is refused", async () => {
    const { source } = createFakeBackend();
    let refuse!: (reason: Error) => void;
    vi.mocked(source.setProjectMuted).mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);

    fireEvent.click(await bell());
    fireEvent.click(muteSwitch());
    await waitFor(() => expect(muteSwitch()).toBeChecked());
    expect(muteSwitch()).toBeDisabled();
    expect(toast).not.toHaveBeenCalled();

    vi.mocked(source.load).mockImplementation(() => new Promise(() => {}));
    refuse(new Error("refused"));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({
      title: "Could not save notification preferences",
      variant: "destructive",
    });
    await waitFor(() => expect(muteSwitch()).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Project notifications" })).toHaveAttribute("data-muted", "false");
  });

  it("is the same setting as the project's tick in Settings, both ways", async () => {
    const projects = [
      { id: "p1", title: "Ленина 42" },
      { id: "p2", title: "Дача, баня" },
      { id: "p3", title: "Офис на Мира" },
    ];
    createFakeBackend({ projects });
    renderWith(
      <>
        <ProjectMuteBell projectId="p3" projectTitle="Офис на Мира" />
        <NotificationsPanel />
      </>,
    );
    const projectsButton = () => screen.getByRole("button", { name: /^For which projects/ });
    await screen.findByRole("heading", { name: "Shurik's briefing" });
    expect(projectsButton()).toHaveTextContent("All projects");

    fireEvent.click(await bell());
    fireEvent.click(muteSwitch());
    await waitFor(() => expect(projectsButton()).toHaveTextContent("2 of 3"));

    // The popover makes the rest of the page inert while it is open.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("switch", { name: LABEL })).not.toBeInTheDocument());
    await waitFor(() => expect(projectsButton()).toBeEnabled());
    fireEvent.click(projectsButton());
    const tick = screen.getByRole("checkbox", { name: "Офис на Мира", hidden: true });
    expect(tick).not.toBeChecked();
    fireEvent.click(tick);

    expect(await bell()).toHaveAttribute("data-muted", "false");
    expect(projectsButton()).toHaveTextContent("All projects");
  });

  it("is not drawn while the state is unknown: before the read answers and when it fails", async () => {
    const { source } = createFakeBackend();
    vi.mocked(source.load).mockRejectedValue(new Error("denied"));
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(source.load).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is not there for a guest, while the session loads, in the demo or in the local playground, and reads nothing", async () => {
    const { source } = createFakeBackend();

    guestRuntimeAuth();
    const guest = renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    guest.unmount();

    loadingRuntimeAuth();
    const pending = renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    pending.unmount();

    authenticateRuntimeAuth("profile-1");
    enterDemoSession("project");
    const demo = renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    demo.unmount();
    clearDemoSession();

    vi.stubEnv("VITE_WORKSPACE_SOURCE", "local");
    renderWith(<ProjectMuteBell projectId="p1" projectTitle="Ленина 42" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    expect(source.load).not.toHaveBeenCalled();
  });

  it("carries the approved Russian wording", () => {
    const ru = (key: string, options?: Record<string, unknown>) => i18n.t(key, { lng: "ru", ...options });

    expect(ru("notifications.projectMute.label")).toBe("Не беспокоить по этому проекту");
    expect(ru("notifications.projectMute.hint", { project: "Ленина 42" })).toBe(
      "Планёрка, подсказки и сообщения от людей по «Ленина 42» перестанут приходить тебе. Остальные участники получают их как раньше.",
    );
    expect(ru("notifications.projectMute.bell")).toBe("Уведомления проекта");
    expect(ru("notifications.projectMute.bellMuted")).toBe("Не беспокоить включено");
  });
});

describe("ProjectMuteRow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
    vi.mocked(toast).mockClear();
  });

  afterEach(() => {
    cleanup();
    clearDemoSession();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is a row with the switch and what it means, writing and taking off the mute", async () => {
    const { source, muted } = createFakeBackend();
    renderWith(<ProjectMuteRow projectId="p1" projectTitle="Ленина 42" />);

    const toggle = await screen.findByRole("switch", { name: LABEL });
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(HINT)).toBeInTheDocument();

    fireEvent.click(toggle);
    await waitFor(() => expect(source.setProjectMuted).toHaveBeenCalledWith("p1", true));
    await waitFor(() => expect(muteSwitch()).toBeChecked());
    await waitFor(() => expect(muteSwitch()).toBeEnabled());
    expect(muted()).toEqual(["p1"]);

    fireEvent.click(muteSwitch());
    await waitFor(() => expect(source.setProjectMuted).toHaveBeenCalledWith("p1", false));
    await waitFor(() => expect(muted()).toEqual([]));
  });

  it("puts the switch back and says so when the write is refused", async () => {
    const { source } = createFakeBackend({ mutedProjectIds: ["p1"] });
    vi.mocked(source.setProjectMuted).mockRejectedValueOnce(new Error("refused"));
    renderWith(<ProjectMuteRow projectId="p1" projectTitle="Ленина 42" />);

    fireEvent.click(await screen.findByRole("switch", { name: LABEL }));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(muteSwitch()).toBeChecked());
  });

  it("is not there in the demo, and reads nothing", async () => {
    const { source } = createFakeBackend();
    enterDemoSession("project");
    renderWith(<ProjectMuteRow projectId="p1" projectTitle="Ленина 42" />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(source.load).not.toHaveBeenCalled();
  });
});
