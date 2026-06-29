import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { __unsafeResetStoreForTests } from "@/data/store";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  enterDemoSession,
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

  it("shows a fixed demo quota card in demo mode", async () => {
    enterDemoSession();
    renderTopBar();

    await openLogoMenu();

    // Demo showcase: used 8 of 50 → 42 remaining.
    expect(screen.getByText("42 of 50 left")).toBeInTheDocument();
    expect(screen.queryByText("Sign in to see usage")).not.toBeInTheDocument();
  });
});
