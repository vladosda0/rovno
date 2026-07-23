import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { __unsafeResetStoreForTests } from "@/data/store";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  enterDemoSession,
  isDemoSessionActive,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderTopBar() {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/home"]}>
        <TopBar aiSidebarCollapsed onToggleAiSidebar={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openLogoMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /rovno/i }), { button: 0, ctrlKey: false });
  await screen.findByRole("menuitem", { name: "Settings" });
}

describe("TopBar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      writable: true,
      value: MouseEvent,
    });
    localStorage.clear();
    sessionStorage.clear();
    rpc.mockReset();
    rpc.mockResolvedValue({ data: null, error: null });
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    setStoredAuthProfile({
      email: "jane@example.com",
      name: "Jane Doe",
    });
    setAuthRole("owner");
    __unsafeResetStoreForTests();
  });

  it("hides the top-right avatar menu on home while keeping account actions in the logo dropdown", async () => {
    renderTopBar();

    expect(screen.queryByText("JD")).not.toBeInTheDocument();

    await openLogoMenu();

    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
  });

  it("shows the real remaining AI-chat quota for an authenticated user", async () => {
    rpc.mockResolvedValue({
      data: [{ ai_chat_used: 7, ai_chat_limit: 50 }],
      error: null,
    });
    authenticateRuntimeAuth();
    renderTopBar();

    await openLogoMenu();

    // 50 - 7 = 43 remaining; UsageMeter caption: "{remaining} of {limit} left".
    expect(await screen.findByText("43 of 50 left")).toBeInTheDocument();
  });

  it("shows an unlimited card (not a hidden card) for an unlimited chat tier", async () => {
    rpc.mockResolvedValue({
      data: [{ ai_chat_used: 120, ai_chat_limit: -1 }],
      error: null,
    });
    authenticateRuntimeAuth();
    renderTopBar();

    await openLogoMenu();

    // limit < 0 = unlimited: shows the unlimited label, never "of -1 left".
    expect(await screen.findByText("Unlimited")).toBeInTheDocument();
    expect(screen.queryByText(/of -1 left/)).not.toBeInTheDocument();
  });

  it("shows a sign-in nudge instead of a balance for a guest", async () => {
    // beforeEach leaves us as a guest (no demo session, not authenticated).
    renderTopBar();

    await openLogoMenu();

    expect(screen.getByText("Sign in to see usage")).toBeInTheDocument();
  });

  it("renders demo chrome instead of an account menu in demo mode", async () => {
    enterDemoSession();
    renderTopBar();

    // The demo strip above the bar carries the honest demo affordances.
    expect(screen.getByText("Demo mode")).toBeInTheDocument();
    expect(screen.getByText("Exit demo")).toBeInTheDocument();
    // The CTA label is responsive (short/full spans), so match by substring.
    expect(screen.getByRole("link", { name: /Create your own project/ })).toBeInTheDocument();

    // The logo menu shrinks to plain navigation: no account row, no credits,
    // no settings, no role switcher, no logout.
    fireEvent.pointerDown(screen.getByRole("button", { name: /rovno/i }), { button: 0, ctrlKey: false });
    await screen.findByRole("menuitem", { name: "Home" });
    expect(screen.queryByRole("menuitem", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Change role" })).not.toBeInTheDocument();
    expect(screen.queryByText(/of \d+ left/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to see usage")).not.toBeInTheDocument();
  });

  it("exits the demo into a clean non-demo state", async () => {
    enterDemoSession();
    renderTopBar();

    fireEvent.click(screen.getByText("Exit demo"));

    await waitFor(() => expect(isDemoSessionActive()).toBe(false));
    // Demo chrome is gone after the exit.
    expect(screen.queryByText("Exit demo")).not.toBeInTheDocument();
  });

  it("clamps an over-quota chat slot to zero remaining", async () => {
    rpc.mockResolvedValue({
      data: [{ ai_chat_used: 60, ai_chat_limit: 50 }],
      error: null,
    });
    authenticateRuntimeAuth();
    renderTopBar();

    await openLogoMenu();

    // remaining = max(50 - 60, 0) = 0; no NaN.
    expect(await screen.findByText("0 of 50 left")).toBeInTheDocument();
  });

  it("hides the card for an authenticated user with a zero chat limit", async () => {
    rpc.mockResolvedValue({
      data: [{ ai_chat_used: 0, ai_chat_limit: 0 }],
      error: null,
    });
    authenticateRuntimeAuth();
    renderTopBar();

    await openLogoMenu();
    // Let the get_current_usage query resolve and commit, so we assert against the
    // LOADED state (limit 0), not the transient pre-load hidden state. Without this
    // the assertion is vacuous (the card is hidden during load regardless of the guard).
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // limit === 0 renders no card (and never reaches the /limit division → no "0 of 0"/NaN bar).
    expect(screen.queryByText(/of \d+ left/)).not.toBeInTheDocument();
    expect(screen.queryByText("Unlimited")).not.toBeInTheDocument();
    // Authenticated, so no guest nudge either.
    expect(screen.queryByText("Sign in to see usage")).not.toBeInTheDocument();
  });

  it("hides the card for an authenticated user whose quota has not loaded", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    authenticateRuntimeAuth();
    renderTopBar();

    await openLogoMenu();

    expect(screen.queryByText(/of \d+ left/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in to see usage")).not.toBeInTheDocument();
  });
});
