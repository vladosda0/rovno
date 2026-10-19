import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";
import { TelegramDeliverySection } from "@/components/settings/panels/TelegramDeliverySection";
import * as briefingSettingsSource from "@/data/briefing-settings-source";
import * as telegramDeliverySource from "@/data/telegram-delivery-source";
import type { TelegramDeliverySettings } from "@/data/telegram-delivery-source";
import { toast } from "@/hooks/use-toast";
import i18n from "@/i18n";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";

const flags = vi.hoisted(() => ({ linkingEnabled: true }));

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/data/messenger-links", () => ({
  get TELEGRAM_LINKING_ENABLED() {
    return flags.linkingEnabled;
  },
  listLinkedIdentities: vi.fn(async () => []),
}));

/** An in-memory stand-in for the row and the link: a reload reads what the writes left. */
function createFakeBackend(initial: { linkedName?: string | null; linked?: boolean; stored?: TelegramDeliverySettings | null } = {}) {
  let stored = initial.stored ?? null;
  const linked = initial.linked ?? true;
  const source: telegramDeliverySource.TelegramDeliverySource = {
    load: vi.fn(async () => ({
      linked,
      linkedName: linked ? (initial.linkedName === undefined ? "@ivan_stroit" : initial.linkedName) : null,
      settings: stored ?? telegramDeliverySource.DEFAULT_TELEGRAM_DELIVERY_SETTINGS,
    })),
    saveSettings: vi.fn(async (patch: Partial<TelegramDeliverySettings>) => {
      stored = { ...(stored ?? telegramDeliverySource.DEFAULT_TELEGRAM_DELIVERY_SETTINGS), ...patch };
    }),
  };
  vi.spyOn(telegramDeliverySource, "getTelegramDeliverySource").mockResolvedValue(source);
  return source;
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </MemoryRouter>,
  );
}

const telegramSwitch = () => screen.getByRole("switch", { name: "Telegram" });
const nightSwitch = () => screen.getByRole("switch", { name: "At night (22:00–08:00) send to Telegram without sound" });

describe("TelegramDeliverySection", () => {
  beforeEach(() => {
    localStorage.clear();
    flags.linkingEnabled = true;
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");
    authenticateRuntimeAuth("profile-1");
    vi.mocked(toast).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("shows a linked Telegram by name with both switches on for a person with no saved row", async () => {
    createFakeBackend();
    renderWithProviders(<TelegramDeliverySection />);

    expect(await screen.findByRole("heading", { name: "Where to send" })).toBeInTheDocument();
    expect(screen.getByText("Linked: @ivan_stroit")).toBeInTheDocument();
    expect(telegramSwitch()).toBeChecked();
    expect(nightSwitch()).toBeChecked();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("shows what is stored", async () => {
    createFakeBackend({ stored: { enabled: false, quietNight: false } });
    renderWithProviders(<TelegramDeliverySection />);

    await screen.findByRole("heading", { name: "Where to send" });
    expect(telegramSwitch()).not.toBeChecked();
    expect(nightSwitch()).not.toBeChecked();
  });

  it("names an account without a username by its display name, and without either by a general name", async () => {
    createFakeBackend({ linkedName: "Иван" });
    const first = renderWithProviders(<TelegramDeliverySection />);
    expect(await screen.findByText("Linked: Иван")).toBeInTheDocument();
    first.unmount();

    createFakeBackend({ linkedName: null });
    renderWithProviders(<TelegramDeliverySection />);
    expect(await screen.findByText("Linked: Telegram account")).toBeInTheDocument();
  });

  it("saves each switch at once, only the field that changed", async () => {
    const source = createFakeBackend();
    renderWithProviders(<TelegramDeliverySection />);
    await screen.findByRole("heading", { name: "Where to send" });

    fireEvent.click(telegramSwitch());
    await waitFor(() => expect(source.saveSettings).toHaveBeenCalledWith({ enabled: false }));
    await waitFor(() => expect(telegramSwitch()).not.toBeChecked());
    await waitFor(() => expect(telegramSwitch()).toBeEnabled());

    fireEvent.click(nightSwitch());
    await waitFor(() => expect(source.saveSettings).toHaveBeenLastCalledWith({ quietNight: false }));
    await waitFor(() => expect(nightSwitch()).not.toBeChecked());
    expect(telegramSwitch()).not.toBeChecked();
  });

  it("puts a switch back and says so when the write is refused", async () => {
    const source = createFakeBackend();
    vi.mocked(source.saveSettings).mockRejectedValue(new Error("refused"));
    renderWithProviders(<TelegramDeliverySection />);
    await screen.findByRole("heading", { name: "Where to send" });

    fireEvent.click(telegramSwitch());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    await waitFor(() => expect(telegramSwitch()).toBeChecked());
  });

  it("offers to link Telegram, with no switches, when none is linked", async () => {
    createFakeBackend({ linked: false });
    renderWithProviders(<TelegramDeliverySection />);

    expect(await screen.findByText("No Telegram account linked yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link Telegram" })).toHaveAttribute("href", "/settings?tab=integrations");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("is absent when no Telegram is linked and this build has no Integrations tab to link one in", async () => {
    flags.linkingEnabled = false;
    const source = createFakeBackend({ linked: false });
    renderWithProviders(<TelegramDeliverySection />);

    await waitFor(() => expect(source.load).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Where to send" })).not.toBeInTheDocument());
  });

  it("is absent when the settings could not be read", async () => {
    const source = createFakeBackend();
    vi.mocked(source.load).mockRejectedValue(new Error("down"));
    renderWithProviders(<TelegramDeliverySection />);

    await waitFor(() => expect(source.load).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Where to send" })).not.toBeInTheDocument();
  });

  it("sits under the briefing in the panel, and is there for a person who gets no briefing", async () => {
    createFakeBackend();
    const briefing: briefingSettingsSource.BriefingSettingsSource = {
      mode: "supabase",
      load: vi.fn(async () => ({
        settings: briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
        projects: [{ id: "p1", title: "Ленина 42" }],
        inAnyProject: true,
        mutedProjectIds: [],
        peopleEnabled: true,
        hintsChatEnabled: true,
        hintsTelegramEnabled: true,
      })),
      saveSettings: vi.fn(async () => {}),
      setProjectMuted: vi.fn(async () => {}),
      setPeopleEnabled: vi.fn(async () => {}),
      setHintsChatEnabled: vi.fn(async () => {}),
      setHintsTelegramEnabled: vi.fn(async () => {}),
    };
    vi.spyOn(briefingSettingsSource, "getBriefingSettingsSource").mockResolvedValue(briefing);
    const first = renderWithProviders(<NotificationsPanel />);

    const delivery = await screen.findByRole("heading", { name: "Where to send" });
    const briefingHeading = screen.getByRole("heading", { name: "Shurik's briefing" });
    expect(briefingHeading.compareDocumentPosition(delivery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    first.unmount();

    vi.mocked(briefing.load).mockResolvedValue({
      settings: briefingSettingsSource.DEFAULT_BRIEFING_SETTINGS,
      projects: [],
      inAnyProject: true,
      mutedProjectIds: [],
      peopleEnabled: true,
      hintsChatEnabled: true,
      hintsTelegramEnabled: true,
    });
    renderWithProviders(<NotificationsPanel />);
    expect(await screen.findByRole("heading", { name: "Where to send" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Shurik's briefing" })).not.toBeInTheDocument();
  });

  it("carries the approved Russian wording", () => {
    const ru = i18n.getFixedT("ru");
    expect(ru("notifications.delivery.title")).toBe("Куда присылать");
    expect(ru("notifications.delivery.telegram")).toBe("Telegram");
    expect(ru("notifications.delivery.linked", { name: "@ivan_stroit" })).toBe("Привязан: @ivan_stroit");
    expect(ru("notifications.delivery.quietNight")).toBe("Ночью (22:00–08:00) в Telegram присылать без звука");
    expect(ru("integrations.telegram.notLinkedHint")).toBe("Аккаунт Telegram пока не привязан.");
    expect(ru("integrations.telegram.connect")).toBe("Привязать Telegram");
  });
});
