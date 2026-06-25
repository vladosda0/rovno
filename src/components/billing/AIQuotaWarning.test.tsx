import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIQuotaWarning } from "@/components/billing/AIQuotaWarning";
import { type TierQuota, useTierQuota } from "@/hooks/useTierQuota";

vi.mock("@/hooks/useTierQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierQuota")>();
  return { ...actual, useTierQuota: vi.fn() };
});

// Togglable BILLING_ENABLED so the upgrade-link-on and link-hidden-off branches
// are both covered, independent of the ambient VITE_BILLING_ENABLED env.
const billing = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, get BILLING_ENABLED() { return billing.enabled; } };
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

function renderWarning() {
  return render(
    <MemoryRouter>
      <AIQuotaWarning usageType="chat" />
    </MemoryRouter>,
  );
}

describe("AIQuotaWarning", () => {
  beforeEach(() => {
    billing.enabled = true;
  });

  it("shows a banner with remaining count and upgrade link between 90% and 100% when billing is on", () => {
    setQuota({ ai_chat_used: 19, ai_chat_limit: 20 });
    renderWarning();
    expect(screen.getByText(/1 of 20 AI messages left/)).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Master")).toBeInTheDocument();
  });

  it("hides the upgrade link when billing is off but still shows the count", () => {
    billing.enabled = false;
    setQuota({ ai_chat_used: 19, ai_chat_limit: 20 });
    renderWarning();
    expect(screen.getByText(/1 of 20 AI messages left/)).toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Master")).not.toBeInTheDocument();
  });

  it("renders nothing below 90%", () => {
    setQuota({ ai_chat_used: 5, ai_chat_limit: 50 });
    const { container } = renderWarning();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once fully consumed (handled by the gate instead)", () => {
    setQuota({ ai_chat_used: 20, ai_chat_limit: 20 });
    const { container } = renderWarning();
    expect(container).toBeEmptyDOMElement();
  });
});
