import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import i18n from "@/i18n";

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, BILLING_ENABLED: true };
});
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useActiveSubscription", () => ({
  useActiveSubscription: () => ({
    status: "none",
    subscription: null,
    readOnly: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/data/tier-limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data/tier-limits")>();
  return {
    ...actual,
    TIER_LIMITS: {
      ...actual.TIER_LIMITS,
      master: { ...actual.TIER_LIMITS.master, ai_chat_per_month: 21, ai_doc_per_month: 3, ai_photo_per_month: -1 },
    },
  };
});

import { PlansDialog } from "@/components/billing/PlansDialog";

function renderDialog() {
  return render(
    <MemoryRouter>
      <PlansDialog open onOpenChange={() => {}} currentPlan="free" />
    </MemoryRouter>,
  );
}

describe("PlansDialog limit lines agree in number", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("uses the singular, few and unlimited forms in Russian", async () => {
    await i18n.changeLanguage("ru");
    renderDialog();

    expect(screen.getByText("1 проверка документов в месяц")).toBeInTheDocument();
    expect(screen.getByText("1 анализ фото в месяц")).toBeInTheDocument();
    expect(screen.getByText("21 ИИ-сообщение в месяц")).toBeInTheDocument();
    expect(screen.getByText("3 проверки документов в месяц")).toBeInTheDocument();
    expect(screen.getByText("∞ анализов фото в месяц")).toBeInTheDocument();
    expect(screen.getByText("50 ИИ-сообщений в месяц")).toBeInTheDocument();
  });

  it("uses the singular and unlimited forms in English", async () => {
    await i18n.changeLanguage("en");
    renderDialog();

    expect(screen.getByText("1 document check / month")).toBeInTheDocument();
    expect(screen.getByText("1 photo analysis / month")).toBeInTheDocument();
    expect(screen.getByText("∞ photo analyses / month")).toBeInTheDocument();
    expect(screen.getByText("50 AI messages / month")).toBeInTheDocument();
  });
});
