import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BillingPanel } from "@/components/settings/panels/BillingPanel";

// vi.mock factories are hoisted above the imports, so the handles they reference
// must be created with vi.hoisted (also hoisted) rather than module-scope consts.
const { mockUseWorkspaceMode, mockNavigate } = vi.hoisted(() => ({
  mockUseWorkspaceMode: vi.fn(),
  mockNavigate: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => mockUseWorkspaceMode(),
}));
// No session → quota query is disabled, so a session-less visitor sees the
// default free-plan card. Returning no data here mirrors that for every mode.
vi.mock("@/hooks/useTierQuota", () => ({ useTierQuota: () => ({ data: undefined, isLoading: false }) }));
// Stub the heavier billing children so the real Supabase client never loads.
vi.mock("@/components/billing/PlansDialog", () => ({ PlansDialog: () => null }));
vi.mock("@/components/billing/SubscriptionSection", () => ({ SubscriptionSection: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const UPGRADE_BUTTON = "Upgrade plan";
const LOGIN_BUTTON = /log in/i;
const SIGN_IN_HINT = "Sign in to manage your subscription.";

describe("BillingPanel session gating", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("swaps the upgrade CTA for a sign-in prompt in guest mode", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "guest" });

    render(<BillingPanel />);

    expect(screen.getByText(SIGN_IN_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: LOGIN_BUTTON })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: UPGRADE_BUTTON })).not.toBeInTheDocument();
  });

  it("routes the guest sign-in CTA to /auth/login", () => {
    mockUseWorkspaceMode.mockReturnValue({ kind: "guest" });

    render(<BillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: LOGIN_BUTTON }));

    expect(mockNavigate).toHaveBeenCalledWith("/auth/login");
  });

  // demo / local keep the upgrade CTA (the plan comparison is part of the
  // product showcase); supabase shows it because there's a real session.
  it.each([
    { label: "supabase", mode: { kind: "supabase" as const, profileId: "p1" } },
    { label: "demo", mode: { kind: "demo" as const } },
    { label: "local", mode: { kind: "local" as const } },
  ])("keeps the upgrade CTA and shows no sign-in prompt in $label mode", ({ mode }) => {
    mockUseWorkspaceMode.mockReturnValue(mode);

    render(<BillingPanel />);

    expect(screen.getByRole("button", { name: UPGRADE_BUTTON })).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
  });
});
