import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntegrationsPanel } from "@/components/settings/panels/IntegrationsPanel";

// vi.mock factories are hoisted above the imports, so the mock handles they
// reference must be created with vi.hoisted (also hoisted) rather than plain
// module-scope consts.
const {
  mockUseWorkspaceMode,
  mockCreateLinkCode,
  mockListLinkedIdentities,
  mockUnlinkIdentity,
  mockNavigate,
} = vi.hoisted(() => ({
  mockUseWorkspaceMode: vi.fn(),
  mockCreateLinkCode: vi.fn(),
  mockListLinkedIdentities: vi.fn(),
  mockUnlinkIdentity: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-workspace-source")>();
  return { ...actual, useWorkspaceMode: () => mockUseWorkspaceMode() };
});

// Fully replace the data layer so the real module (and its Supabase client)
// never loads, and so we can assert the bot-identity RPCs are not called.
vi.mock("@/data/messenger-links", () => ({
  createLinkCode: (...args: unknown[]) => mockCreateLinkCode(...args),
  listLinkedIdentities: (...args: unknown[]) => mockListLinkedIdentities(...args),
  unlinkIdentity: (...args: unknown[]) => mockUnlinkIdentity(...args),
  telegramDeepLink: (code: string) => `https://t.me/rovno_ai_bot?start=${code}`,
  TELEGRAM_BOT_USERNAME: "rovno_ai_bot",
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const CONNECT_BUTTON = /link telegram/i;
const LOGIN_BUTTON = /log in/i;
const SIGN_IN_HINT = "Sign in to link your Telegram account.";

describe("IntegrationsPanel", () => {
  beforeEach(() => {
    mockListLinkedIdentities.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Demo / local / guest visitors can reach this panel because AppLayout does
  // not redirect them, but the bot-identity RPCs require an authenticated
  // Supabase session.
  it.each([
    { label: "guest", mode: { kind: "guest" as const } },
    { label: "demo", mode: { kind: "demo" as const } },
    { label: "local", mode: { kind: "local" as const } },
  ])("gates linking behind sign-in and skips the RPC in $label mode", async ({ mode }) => {
    mockUseWorkspaceMode.mockReturnValue(mode);

    render(<IntegrationsPanel />);

    expect(await screen.findByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeInTheDocument();
    // The connect button — and the doomed create_link_code RPC behind it — must
    // be absent for session-less users.
    expect(screen.queryByRole("button", { name: CONNECT_BUTTON })).not.toBeInTheDocument();
    // No session means we never even attempt the load RPC.
    expect(mockListLinkedIdentities).not.toHaveBeenCalled();
    expect(mockCreateLinkCode).not.toHaveBeenCalled();
  });

  it("routes the sign-in CTA to /auth/login", async () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "guest" });

    render(<IntegrationsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: LOGIN_BUTTON }));

    expect(mockNavigate).toHaveBeenCalledWith("/auth/login");
  });

  it("preserves the link flow for an authenticated Supabase session", async () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "profile-1" });

    render(<IntegrationsPanel />);

    // Authenticated users still load their identities and see the connect button.
    expect(await screen.findByRole("button", { name: CONNECT_BUTTON })).toBeInTheDocument();
    expect(mockListLinkedIdentities).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
  });

  // The bot handle is per-environment config interpolated into the copy. If the
  // {{bot}} placeholder ever stops being fed, users see a literal "@{{bot}}" and
  // the deep link points nowhere useful, so pin the rendered handle.
  it("renders the configured bot handle in the code instructions", async () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "supabase", profileId: "profile-1" });
    mockCreateLinkCode.mockResolvedValue("ABC123");

    render(<IntegrationsPanel />);

    fireEvent.click(await screen.findByRole("button", { name: CONNECT_BUTTON }));

    expect(await screen.findByText(/Open @rovno_ai_bot and send this code/)).toBeInTheDocument();
    const openBot = screen.getByRole("link", { name: /Open @rovno_ai_bot/ });
    expect(openBot).toHaveAttribute("href", "https://t.me/rovno_ai_bot?start=ABC123");
    expect(screen.queryByText(/\{\{bot\}\}/)).not.toBeInTheDocument();
  });
});
