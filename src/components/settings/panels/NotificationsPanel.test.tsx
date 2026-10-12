import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";
import * as briefingSettingsSource from "@/data/briefing-settings-source";
import type { BriefingSettings, BriefingSettingsSnapshot } from "@/data/briefing-settings-source";
import * as telegramDeliverySource from "@/data/telegram-delivery-source";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { authenticateRuntimeAuth, guestRuntimeAuth, loadingRuntimeAuth } from "@/test/runtime-auth";

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

if (typeof Element.prototype.hasPointerCapture !== "function") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

const THREE_PROJECTS = [
  { id: "p1", title: "Ленина 42" },
  { id: "p2", title: "Дача, баня" },
  { id: "p3", title: "Офис на Мира" },
];

/** An in-memory stand-in for the tables: a reload reads what the writes left. */
function createFakeBackend(
  initial: Partial<BriefingSettingsSnapshot> & { storedSettings?: BriefingSettings | null; storedPeopleEnabled?: boolean } = {},
) {
  let stored: BriefingSettings | null = initial.storedSettings ?? null;
  // Undefined stands for "no value written yet", which reads as on.
  let peopleEnabled: boolean | undefined = initial.storedPeopleEnabled;
  let muted = [...(initial.mutedProjectIds ?? [])];
  const projects = initial.projects ?? THREE_PROJECTS;
  const inAnyProject = initial.inAnyProject ?? true;
  const source: briefingSettingsSource.BriefingSettingsSource = {
    mode: "supabase",
    load: vi.fn(async () => ({
      settings: stored ?? briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
      projects,
      inAnyProject,
      mutedProjectIds: [...muted],
      peopleEnabled: peopleEnabled ?? true,
    })),
    saveSettings: vi.fn(async (patch: Partial<BriefingSettings>) => {
      stored = { ...(stored ?? briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS), ...patch };
    }),
    setPeopleEnabled: vi.fn(async (enabled: boolean) => {
      peopleEnabled = enabled;
    }),
    setProjectMuted: vi.fn(async (projectId: string, isMuted: boolean) => {
      muted = isMuted ? [...muted.filter((id) => id !== projectId), projectId] : muted.filter((id) => id !== projectId);
    }),
  };
  vi.spyOn(briefingSettingsSource, "getBriefingSettingsSource").mockResolvedValue(source);
  return { source, hasRow: () => stored !== null, peopleEnabled: () => peopleEnabled };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <NotificationsPanel />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const briefingSwitch = () => screen.getByRole("switch", { name: "What needs attention today" });
const weekendsSwitch = () => screen.getByRole("switch", { name: "Also send on Saturday and Sunday" });
const timeSelect = () => screen.getByRole("combobox", { name: "Briefing time" });
const projectsButton = () => screen.getByRole("button", { name: /^For which projects/ });
const peopleSwitch = () => screen.getByRole("switch", { name: "Messages from people in a project" });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** From now on a reload hangs, so what the screen shows is what the write handlers left. */
function holdReloads(source: briefingSettingsSource.BriefingSettingsSource) {
  vi.mocked(source.load).mockImplementation(() => new Promise(() => {}));
}

async function loaded() {
  await screen.findByRole("heading", { name: "Shurik's briefing" });
}

describe("NotificationsPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
    vi.mocked(toast).mockClear();
    // The "Where to send" section has its own suite; here it stays out of the way.
    vi.spyOn(telegramDeliverySource, "getTelegramDeliverySource").mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("shows the briefing section with its three rows, at the defaults for a person with no saved row", async () => {
    createFakeBackend();
    renderPanel();
    await loaded();

    expect(screen.getByText("What needs attention today")).toBeInTheDocument();
    expect(screen.getByText("Also send on Saturday and Sunday")).toBeInTheDocument();
    expect(screen.getByText("For which projects")).toBeInTheDocument();
    expect(briefingSwitch()).toBeChecked();
    expect(timeSelect()).toHaveTextContent("09:00");
    expect(weekendsSwitch()).not.toBeChecked();
    expect(projectsButton()).toHaveTextContent("All projects");
  });

  it("has nothing left of the old screen and no save button", async () => {
    createFakeBackend();
    renderPanel();
    await loaded();

    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    for (const gone of [/in-app/i, /email/i, /telegram/i, /coming soon/i, /digest/i, /assigned to me/i, /billing/i, /subscription/i]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it("shows what is stored", async () => {
    createFakeBackend({ storedSettings: { enabled: false, minute: 1110, weekends: true }, mutedProjectIds: ["p3"] });
    renderPanel();
    await loaded();

    expect(briefingSwitch()).not.toBeChecked();
    expect(timeSelect()).toHaveTextContent("18:30");
    expect(weekendsSwitch()).toBeChecked();
    expect(projectsButton()).toHaveTextContent("2 of 3");
  });

  it("offers every half hour of the day, 00:00 to 23:30, and saves the one picked at once", async () => {
    const { source, hasRow } = createFakeBackend();
    renderPanel();
    await loaded();

    fireEvent.click(timeSelect());
    const options = within(await screen.findByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(48);
    expect(options[0]).toHaveTextContent("00:00");
    expect(options[1]).toHaveTextContent("00:30");
    expect(options[47]).toHaveTextContent("23:30");

    expect(hasRow()).toBe(false);
    fireEvent.click(within(screen.getByRole("listbox")).getByText("18:30"));

    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledWith({ minute: 1110 }));
    expect(hasRow()).toBe(true);
    expect(timeSelect()).toHaveTextContent("18:30");
  });

  it("saves the switch at once: off stops the briefing, on brings it back", async () => {
    const { source } = createFakeBackend();
    renderPanel();
    await loaded();

    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(briefingSwitch()).not.toBeChecked());
    expect(source.saveSettings).toHaveBeenLastCalledWith({ enabled: false });

    await waitFor(() => expect(source.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(briefingSwitch()).toBeEnabled());
    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(briefingSwitch()).toBeChecked());
    expect(source.saveSettings).toHaveBeenLastCalledWith({ enabled: true });
  });

  it("saves the weekends switch at once", async () => {
    const { source } = createFakeBackend();
    renderPanel();
    await loaded();

    fireEvent.click(weekendsSwitch());

    await waitFor(() => expect(weekendsSwitch()).toBeChecked());
    expect(source.saveSettings).toHaveBeenCalledWith({ weekends: true });
  });

  it("lists the person's projects with every one ticked, a new project included", async () => {
    createFakeBackend({ projects: [...THREE_PROJECTS, { id: "p4", title: "Новый объект" }] });
    renderPanel();
    await loaded();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(projectsButton());

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((box) => box.getAttribute("aria-label") ?? box.closest("label")?.textContent)).toEqual([
      "Ленина 42",
      "Дача, баня",
      "Офис на Мира",
      "Новый объект",
    ]);
    for (const box of boxes) expect(box).toBeChecked();
    expect(projectsButton()).toHaveTextContent("All projects");
    expect(projectsButton()).toHaveAttribute("aria-expanded", "true");
  });

  it("turns a project off with its tick and back on, saving each at once", async () => {
    const { source } = createFakeBackend();
    renderPanel();
    await loaded();
    fireEvent.click(projectsButton());

    fireEvent.click(screen.getByRole("checkbox", { name: "Офис на Мира" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Офис на Мира" })).not.toBeChecked());
    expect(projectsButton()).toHaveTextContent("2 of 3");
    expect(source.setProjectMuted).toHaveBeenLastCalledWith("p3", true);

    await waitFor(() => expect(source.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Офис на Мира" })).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Офис на Мира" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Офис на Мира" })).toBeChecked());
    expect(projectsButton()).toHaveTextContent("All projects");
    expect(source.setProjectMuted).toHaveBeenLastCalledWith("p3", false);
    expect(source.saveSettings).not.toHaveBeenCalled();
  });

  it("does not count a switched-off project that is no longer in the list", async () => {
    createFakeBackend({ mutedProjectIds: ["p-left"] });
    renderPanel();
    await loaded();

    expect(projectsButton()).toHaveTextContent("All projects");
  });

  it.each([
    ["has no projects at all", { projects: [], inAnyProject: false }],
    ["is only a member of projects, a contractor or a viewer", { projects: [], inAnyProject: true }],
  ])("shows the instant section, and no briefing, to a person who %s", async (_who, initial) => {
    createFakeBackend(initial);
    renderPanel();

    expect(await screen.findByRole("heading", { name: "Instant" })).toBeInTheDocument();
    expect(peopleSwitch()).toBeChecked();
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Shurik's briefing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing to set up/)).not.toBeInTheDocument();
  });

  it("shows such a person where to send as well, under the instant section", async () => {
    createFakeBackend({ projects: [] });
    vi.mocked(telegramDeliverySource.getTelegramDeliverySource).mockResolvedValue({
      load: vi.fn(async () => ({
        linked: true,
        linkedName: "@ivan_stroit",
        settings: telegramDeliverySource.DEFAULT_TELEGRAM_DELIVERY_SETTINGS,
      })),
      saveSettings: vi.fn(async () => {}),
    });
    renderPanel();

    const delivery = await screen.findByRole("heading", { name: "Where to send" });
    const instant = screen.getByRole("heading", { name: "Instant" });
    expect(instant.compareDocumentPosition(delivery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the instant section between the briefing and where to send, with what the switch means", async () => {
    createFakeBackend();
    vi.mocked(telegramDeliverySource.getTelegramDeliverySource).mockResolvedValue({
      load: vi.fn(async () => ({
        linked: true,
        linkedName: "@ivan_stroit",
        settings: telegramDeliverySource.DEFAULT_TELEGRAM_DELIVERY_SETTINGS,
      })),
      saveSettings: vi.fn(async () => {}),
    });
    renderPanel();
    await loaded();

    const briefingHeading = screen.getByRole("heading", { name: "Shurik's briefing" });
    const instant = screen.getByRole("heading", { name: "Instant" });
    const delivery = await screen.findByRole("heading", { name: "Where to send" });
    expect(briefingHeading.compareDocumentPosition(instant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(instant.compareDocumentPosition(delivery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Messages from people in a project")).toBeInTheDocument();
    expect(screen.getByText("Someone wrote in a task or assigned a task to you")).toBeInTheDocument();
    expect(peopleSwitch()).toBeChecked();
  });

  it("shows messages from people as off when that is what is stored", async () => {
    createFakeBackend({ storedPeopleEnabled: false });
    renderPanel();
    await loaded();

    expect(peopleSwitch()).not.toBeChecked();
    expect(briefingSwitch()).toBeChecked();
  });

  it("saves the messages-from-people switch at once, that value alone: off, then back on", async () => {
    const { source, peopleEnabled, hasRow } = createFakeBackend();
    renderPanel();
    await loaded();

    fireEvent.click(peopleSwitch());
    await waitFor(() => expect(source.setPeopleEnabled).toHaveBeenCalledWith(false));
    await waitFor(() => expect(peopleSwitch()).not.toBeChecked());
    await waitFor(() => expect(peopleSwitch()).toBeEnabled());
    expect(peopleEnabled()).toBe(false);
    expect(source.saveSettings).not.toHaveBeenCalled();
    expect(hasRow()).toBe(false);

    fireEvent.click(peopleSwitch());
    await waitFor(() => expect(source.setPeopleEnabled).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(peopleSwitch()).toBeChecked());
    expect(peopleEnabled()).toBe(true);
  });

  it("puts the messages-from-people switch back and says so when the write is refused", async () => {
    const { source } = createFakeBackend({ projects: [] });
    let refuse!: (reason: Error) => void;
    vi.mocked(source.setPeopleEnabled).mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
    renderPanel();
    await screen.findByRole("heading", { name: "Instant" });

    fireEvent.click(peopleSwitch());
    await waitFor(() => expect(peopleSwitch()).not.toBeChecked());
    expect(peopleSwitch()).toBeDisabled();
    expect(toast).not.toHaveBeenCalled();

    holdReloads(source);
    refuse(new Error("refused"));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({
      title: "Could not save notification preferences",
      variant: "destructive",
    });
    await waitFor(() => expect(peopleSwitch()).toBeChecked());
  });

  it("offers a guest the way to sign in, and reads nothing", async () => {
    const { source } = createFakeBackend();
    guestRuntimeAuth();
    renderPanel();

    expect(screen.getByText("Sign in to set up notifications.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(source.load).not.toHaveBeenCalled();
  });

  it("shows a placeholder, not an empty tab, while the session or the settings are loading", async () => {
    const { source } = createFakeBackend();
    loadingRuntimeAuth();
    const session = renderPanel();
    expect(screen.getByTestId("notifications-loading")).toBeInTheDocument();
    session.unmount();

    authenticateRuntimeAuth("profile-1");
    const gate = deferred<BriefingSettingsSnapshot>();
    vi.mocked(source.load).mockReturnValueOnce(gate.promise);
    renderPanel();
    expect(await screen.findByTestId("notifications-loading")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    gate.resolve({
      settings: briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
      projects: THREE_PROJECTS,
      inAnyProject: true,
      mutedProjectIds: [],
      peopleEnabled: true,
    });
    await loaded();
    expect(screen.queryByTestId("notifications-loading")).not.toBeInTheDocument();
  });

  it("lets one change through at a time: while it is on its way every control waits, then all come back", async () => {
    const { source } = createFakeBackend();
    const write = deferred<void>();
    vi.mocked(source.saveSettings).mockReturnValueOnce(write.promise);
    renderPanel();
    await loaded();
    fireEvent.click(projectsButton());
    const controls = () => [briefingSwitch(), weekendsSwitch(), timeSelect(), projectsButton(), ...screen.getAllByRole("checkbox")];
    expect(controls()).toHaveLength(7);
    holdReloads(source);

    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(briefingSwitch()).toBeDisabled());
    expect(briefingSwitch()).not.toBeChecked();
    for (const control of controls()) expect(control).toBeDisabled();

    fireEvent.click(weekendsSwitch());
    fireEvent.click(screen.getByRole("checkbox", { name: "Дача, баня" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(source.saveSettings).toHaveBeenCalledTimes(1);
    expect(source.setProjectMuted).not.toHaveBeenCalled();
    expect(weekendsSwitch()).not.toBeChecked();

    write.resolve();
    await waitFor(() => expect(briefingSwitch()).toBeEnabled());
    for (const control of controls()) expect(control).toBeEnabled();
    expect(briefingSwitch()).not.toBeChecked();
  });

  it("is back on the saved values after two refused changes in a row", async () => {
    const { source } = createFakeBackend();
    vi.mocked(source.saveSettings).mockRejectedValue(new Error("refused"));
    renderPanel();
    await loaded();
    holdReloads(source);

    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(briefingSwitch()).toBeEnabled());
    expect(briefingSwitch()).toBeChecked();

    fireEvent.click(weekendsSwitch());
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(weekendsSwitch()).toBeEnabled());

    expect(source.saveSettings).toHaveBeenNthCalledWith(1, { enabled: false });
    expect(source.saveSettings).toHaveBeenNthCalledWith(2, { weekends: true });
    expect(briefingSwitch()).toBeChecked();
    expect(weekendsSwitch()).not.toBeChecked();
    expect(timeSelect()).toHaveTextContent("09:00");
  });

  it("keeps a change on screen when a reload that started before it lands after it", async () => {
    const { source } = createFakeBackend();
    renderPanel();
    await loaded();

    const staleReload = deferred<BriefingSettingsSnapshot>();
    vi.mocked(source.load).mockReturnValueOnce(staleReload.promise);
    fireEvent.click(weekendsSwitch());
    await waitFor(() => expect(source.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(briefingSwitch()).toBeEnabled());

    const write = deferred<void>();
    vi.mocked(source.saveSettings).mockReturnValueOnce(write.promise);
    holdReloads(source);
    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(briefingSwitch()).not.toBeChecked());

    staleReload.resolve({
      settings: { ...briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS, weekends: true },
      projects: THREE_PROJECTS,
      inAnyProject: true,
      mutedProjectIds: [],
      peopleEnabled: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(briefingSwitch()).not.toBeChecked();
  });

  it("puts a switch back and says so when the write is refused", async () => {
    const { source } = createFakeBackend();
    let refuse!: (reason: Error) => void;
    vi.mocked(source.saveSettings).mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
    renderPanel();
    await loaded();

    fireEvent.click(briefingSwitch());
    await waitFor(() => expect(briefingSwitch()).not.toBeChecked());
    expect(toast).not.toHaveBeenCalled();

    holdReloads(source);
    refuse(new Error("refused"));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast).mock.calls[0][0]).toMatchObject({
      title: "Could not save notification preferences",
      variant: "destructive",
    });
    await waitFor(() => expect(briefingSwitch()).toBeChecked());
  });

  it("puts the time back when the write is refused", async () => {
    const { source } = createFakeBackend();
    vi.mocked(source.saveSettings).mockRejectedValueOnce(new Error("refused"));
    renderPanel();
    await loaded();
    holdReloads(source);

    fireEvent.click(timeSelect());
    fireEvent.click(within(await screen.findByRole("listbox")).getByText("18:30"));

    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(timeSelect()).toHaveTextContent("09:00"));
  });

  it("puts a project's tick back and says so when the write is refused", async () => {
    const { source } = createFakeBackend();
    let refuse!: (reason: Error) => void;
    vi.mocked(source.setProjectMuted).mockReturnValueOnce(new Promise((_resolve, reject) => { refuse = reject; }));
    renderPanel();
    await loaded();
    fireEvent.click(projectsButton());

    fireEvent.click(screen.getByRole("checkbox", { name: "Дача, баня" }));
    await waitFor(() => expect(projectsButton()).toHaveTextContent("2 of 3"));

    holdReloads(source);
    refuse(new Error("refused"));
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Дача, баня" })).toBeChecked());
    expect(projectsButton()).toHaveTextContent("All projects");
  });

  it("shows nothing to change, and writes nothing, when the settings could not be read", async () => {
    const { source } = createFakeBackend();
    vi.mocked(source.load).mockRejectedValue(new Error("denied"));
    renderPanel();

    await waitFor(() => expect(source.load).toHaveBeenCalled());
    expect(await screen.findByText("Couldn't load notification settings. Refresh the page.")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("carries the approved Russian wording", () => {
    const ru = (key: string, options?: Record<string, unknown>) => i18n.t(key, { lng: "ru", ...options });

    expect(ru("notifications.briefing.title")).toBe("Планёрка от Шурика");
    expect(ru("notifications.briefing.attention")).toBe("Что сегодня требует внимания");
    expect(ru("notifications.briefing.weekends")).toBe("Присылать и в субботу и воскресенье");
    expect(ru("notifications.briefing.projects")).toBe("По каким проектам");
    expect(ru("notifications.briefing.allProjects")).toBe("Все проекты");
    expect(ru("notifications.briefing.someProjects", { selected: 2, total: 3 })).toBe("2 из 3");
    expect(ru("notifications.instant.title")).toBe("Мгновенные");
    expect(ru("notifications.instant.people")).toBe("Сообщения от людей в проекте");
    expect(ru("notifications.instant.peopleHint")).toBe("Кто-то написал в задаче или назначил тебе задачу");
  });
});
