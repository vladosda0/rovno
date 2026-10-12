import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BillingPanel } from "@/components/settings/panels/BillingPanel";

// vi.mock factories are hoisted above the imports, so the handles they reference
// must be created with vi.hoisted (also hoisted) rather than module-scope consts.
const { mockUseWorkspaceMode, mockNavigate, mockUseTierQuota } = vi.hoisted(() => ({
  mockUseWorkspaceMode: vi.fn(),
  mockNavigate: vi.fn(),
  mockUseTierQuota: vi.fn(),
}));

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => mockUseWorkspaceMode(),
}));
vi.mock("@/hooks/useTierQuota", () => ({ useTierQuota: () => mockUseTierQuota() }));
// Stub the heavier billing children so the real Supabase client never loads.
vi.mock("@/components/billing/PlansDialog", () => ({
  PlansDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="plans-dialog" /> : null),
}));
vi.mock("@/components/billing/SubscriptionSection", () => ({ SubscriptionSection: () => null }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const UPGRADE_BUTTON = "Upgrade plan";
const COMPARE_BUTTON = "Compare plans";
const LOGIN_BUTTON = /log in/i;
const SIGN_IN_HINT = "Sign in to manage your subscription.";
const FREE_PLAN_TITLE = "Бесплатно plan";
const PLAN_LOAD_ERROR = "Couldn't load your plan.";

// No session → the quota query is disabled and returns no data.
const QUOTA_DISABLED = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
const FREE_QUOTA = {
  plan_code: "free",
  ai_chat_used: 0,
  ai_chat_limit: 10,
  ai_doc_used: 0,
  ai_doc_limit: 0,
  ai_photo_used: 0,
  ai_photo_limit: 0,
  estimates_used: 0,
  estimates_limit: 1,
  period_start: "2026-10-01T00:00:00Z",
  period_end: "2026-11-01T00:00:00Z",
};
const SUPABASE_MODE = { kind: "supabase" as const, profileId: "p1" };

describe("BillingPanel session gating", () => {
  beforeEach(() => {
    mockUseTierQuota.mockReturnValue(QUOTA_DISABLED);
  });

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
  // product showcase); supabase shows it once the plan is known to be upgradable.
  it.each([
    { label: "supabase", mode: SUPABASE_MODE, quota: { ...QUOTA_DISABLED, data: FREE_QUOTA } },
    { label: "demo", mode: { kind: "demo" as const }, quota: QUOTA_DISABLED },
    { label: "local", mode: { kind: "local" as const }, quota: QUOTA_DISABLED },
  ])("keeps the upgrade CTA and shows no sign-in prompt in $label mode", ({ mode, quota }) => {
    mockUseWorkspaceMode.mockReturnValue(mode);
    mockUseTierQuota.mockReturnValue(quota);

    render(<BillingPanel />);

    expect(screen.getByText(FREE_PLAN_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: UPGRADE_BUTTON })).toBeInTheDocument();
    expect(screen.queryByText(SIGN_IN_HINT)).not.toBeInTheDocument();
  });
});

describe("BillingPanel while the plan is unknown", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { label: "the quota is loading", mode: SUPABASE_MODE, quota: { ...QUOTA_DISABLED, isLoading: true } },
    { label: "the session is still resolving", mode: { kind: "pending-supabase" as const }, quota: QUOTA_DISABLED },
  ])("names no plan and offers no upgrade while $label", ({ mode, quota }) => {
    mockUseWorkspaceMode.mockReturnValue(mode);
    mockUseTierQuota.mockReturnValue(quota);

    render(<BillingPanel />);

    expect(screen.queryByText(FREE_PLAN_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: UPGRADE_BUTTON })).not.toBeInTheDocument();
    expect(screen.queryByText(PLAN_LOAD_ERROR)).not.toBeInTheDocument();
    expect(screen.getByTestId("billing-plan-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COMPARE_BUTTON })).toBeDisabled();
  });

  it("shows a load error with a retry instead of the free plan when the quota fails", () => {
    const refetch = vi.fn();
    mockUseWorkspaceMode.mockReturnValue(SUPABASE_MODE);
    mockUseTierQuota.mockReturnValue({ ...QUOTA_DISABLED, isError: true, refetch });

    render(<BillingPanel />);

    expect(screen.queryByText(FREE_PLAN_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: UPGRADE_BUTTON })).not.toBeInTheDocument();
    expect(screen.getByText(PLAN_LOAD_ERROR)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: COMPARE_BUTTON })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the plan it already has when a later refetch fails", () => {
    mockUseWorkspaceMode.mockReturnValue(SUPABASE_MODE);
    mockUseTierQuota.mockReturnValue({ ...QUOTA_DISABLED, data: FREE_QUOTA, isError: true });

    render(<BillingPanel />);

    expect(screen.getByText(FREE_PLAN_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PLAN_LOAD_ERROR)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: COMPARE_BUTTON })).toBeEnabled();
  });

  it("closes the open plans dialog when the plan becomes unknown", () => {
    mockUseWorkspaceMode.mockReturnValue(SUPABASE_MODE);
    mockUseTierQuota.mockReturnValue({ ...QUOTA_DISABLED, data: FREE_QUOTA });

    const { rerender } = render(<BillingPanel />);
    fireEvent.click(screen.getByRole("button", { name: COMPARE_BUTTON }));
    expect(screen.getByTestId("plans-dialog")).toBeInTheDocument();

    mockUseTierQuota.mockReturnValue({ ...QUOTA_DISABLED, isLoading: true });
    rerender(<BillingPanel />);

    expect(screen.queryByTestId("plans-dialog")).not.toBeInTheDocument();

    mockUseTierQuota.mockReturnValue({ ...QUOTA_DISABLED, data: FREE_QUOTA });
    rerender(<BillingPanel />);

    expect(screen.queryByTestId("plans-dialog")).not.toBeInTheDocument();
  });
});
