import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Document checks and photo analysis are sold in every plan but do not exist in
// the product yet (rovno-db#45, decided by Vlad 2026-09-29). Every surface that
// promises them keeps the line, greyed out and tagged "Coming soon", while the
// live chat allowance stays a normal line. Limits and counters in the DB stay.

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({
    status: "active",
    subscription: null,
    readOnly: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => ({ kind: "supabase", profileId: "p1" }),
}));
vi.mock("@/hooks/useTierQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierQuota")>();
  return {
    ...actual,
    useTierQuota: () => ({
      data: {
        plan_code: "master",
        ai_chat_used: 5,
        ai_chat_limit: 500,
        ai_doc_used: 0,
        ai_doc_limit: 10,
        ai_photo_used: 0,
        ai_photo_limit: 15,
        estimates_used: 1,
        estimates_limit: -1,
        period_start: "2026-09-01T00:00:00Z",
        period_end: "2026-10-01T00:00:00Z",
      },
      isLoading: false,
    }),
  };
});
vi.mock("@/components/billing/SubscriptionSection", () => ({ SubscriptionSection: () => null }));

import { PricingBlock } from "@/components/billing/PricingBlock";
import { PlansDialog } from "@/components/billing/PlansDialog";
import { BillingPanel } from "@/components/settings/panels/BillingPanel";
import { Pricing } from "@/components/landing/LandingSections";

const SOON = "Coming soon";

function expectSoon(text: string) {
  const row = screen.getByText(text).closest("[data-soon]");
  expect(row, `"${text}" should be greyed out`).not.toBeNull();
  expect(within(row as HTMLElement).getByText(SOON)).toBeInTheDocument();
}

function expectLive(text: string) {
  expect(screen.getByText(text).closest("[data-soon]")).toBeNull();
}

describe("unreleased AI features are marked 'Coming soon'", () => {
  it("landing pricing section (the public price list): every plan", () => {
    render(
      <MemoryRouter>
        <Pricing startPath="/auth/signup" />
      </MemoryRouter>,
    );
    for (const text of [
      "1 document check/mo",
      "10 document checks/mo",
      "50 document checks/mo",
      "1 photo analysis/mo",
      "15 photo analyses/mo",
      "100 photo analyses/mo",
    ]) {
      expectSoon(text);
    }
    expectLive("500 AI chat messages/mo");
  });

  it("in-app pricing block: document checks and photo analyses on every plan", () => {
    render(
      <MemoryRouter>
        <PricingBlock />
      </MemoryRouter>,
    );
    for (const text of [
      "1 document check/mo",
      "10 document checks/mo",
      "50 document checks/mo",
      "1 photo analysis/mo",
      "15 photo analyses/mo",
      "100 photo analyses/mo",
    ]) {
      expectSoon(text);
    }
    expectLive("500 AI chat messages/mo");
  });

  it("plans dialog: document and photo limit lines on every plan", () => {
    render(
      <MemoryRouter>
        <PlansDialog open onOpenChange={() => {}} currentPlan="free" />
      </MemoryRouter>,
    );
    for (const text of [
      "1 document check / month",
      "10 document checks / month",
      "50 document checks / month",
      "1 photo analysis / month",
      "15 photo analyses / month",
      "100 photo analyses / month",
    ]) {
      expectSoon(text);
    }
    expectLive("500 AI messages / month");
  });

  it("settings billing: no 'N of M left' meter for features that do not exist", () => {
    render(
      <MemoryRouter>
        <BillingPanel />
      </MemoryRouter>,
    );
    expectSoon("Document checks");
    expectSoon("Photo analysis");
    expect(screen.queryByText("10 of 10 left")).toBeNull();
    expect(screen.queryByText("15 of 15 left")).toBeNull();
    expectLive("AI chat");
    expect(screen.getByText("495 of 500 left")).toBeInTheDocument();
  });
});
