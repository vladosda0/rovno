import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIQuotaGate } from "@/components/billing/AIQuotaGate";
import { type TierQuota, useTierQuota } from "@/hooks/useTierQuota";

vi.mock("@/hooks/useTierQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierQuota")>();
  return { ...actual, useTierQuota: vi.fn() };
});

const mockedUseTierQuota = vi.mocked(useTierQuota);

function setQuota(partial: Partial<TierQuota>) {
  const quota: TierQuota = {
    plan_code: "free",
    ai_chat_used: 0,
    ai_chat_limit: 50,
    ai_doc_used: 0,
    ai_doc_limit: 1,
    ai_photo_used: 0,
    ai_photo_limit: 1,
    estimates_used: 0,
    estimates_limit: 1,
    period_start: "2026-05-01T00:00:00.000Z",
    period_end: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
  mockedUseTierQuota.mockReturnValue(
    { data: quota } as unknown as ReturnType<typeof useTierQuota>,
  );
}

function renderGate() {
  return render(
    <MemoryRouter>
      <AIQuotaGate usageType="chat">
        <button type="button">composer</button>
      </AIQuotaGate>
    </MemoryRouter>,
  );
}

describe("AIQuotaGate", () => {
  it("renders children unobstructed when under the limit", () => {
    setQuota({ ai_chat_used: 5, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("composer")).toBeInTheDocument();
    expect(screen.queryByText("AI chat limit reached")).not.toBeInTheDocument();
  });

  it("shows the paywall overlay and CTA when the slot is exhausted", () => {
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("AI chat limit reached")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Master for 990 ₽")).toBeInTheDocument();
  });

  it("fails open and renders children while the quota is loading", () => {
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    renderGate();
    expect(screen.getByText("composer")).toBeInTheDocument();
    expect(screen.queryByText("AI chat limit reached")).not.toBeInTheDocument();
  });

  it("never paywalls an unlimited (-1) slot, even when used is high", () => {
    setQuota({ ai_chat_used: 999, ai_chat_limit: -1 });
    renderGate();
    expect(screen.getByText("composer")).toBeInTheDocument();
    expect(screen.queryByText("AI chat limit reached")).not.toBeInTheDocument();
  });

  it("shows the title but no upsell CTA button on the Brigade plan", () => {
    setQuota({ plan_code: "brigade", ai_chat_used: 2000, ai_chat_limit: 2000 });
    renderGate();
    expect(screen.getByText("AI chat limit reached")).toBeInTheDocument();
    // The CTA is the only upsell <button>; the gate body i18n still mentions the
    // Master plan's allowance, so we match the button role specifically.
    expect(screen.queryByRole("button", { name: /Upgrade to/i })).not.toBeInTheDocument();
  });
});
