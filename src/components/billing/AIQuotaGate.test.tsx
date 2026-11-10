import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AIQuotaGate } from "@/components/billing/AIQuotaGate";
import { type TierQuota, useTierQuota } from "@/hooks/useTierQuota";

vi.mock("@/hooks/useTierQuota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useTierQuota")>();
  return { ...actual, useTierQuota: vi.fn() };
});

// Make BILLING_ENABLED togglable so the gate's billing-on (priced checkout CTA)
// and billing-off (disabled "soon" affordance) branches are both covered,
// independent of the ambient VITE_BILLING_ENABLED env.
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

// A fresh element per call: rerender() with the same element is a no-op.
function gateTree() {
  return (
    <MemoryRouter>
      <AIQuotaGate usageType="chat">
        <button type="button">composer</button>
      </AIQuotaGate>
    </MemoryRouter>
  );
}

function renderGate() {
  return render(gateTree());
}

describe("AIQuotaGate", () => {
  beforeEach(() => {
    billing.enabled = true;
  });

  it("takes the composer away and stands the card in its place", () => {
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.queryByText("composer")).not.toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).not.toHaveAttribute("aria-live");
    expect(screen.getByRole("alertdialog").className).toContain("rounded-panel");
  });

  it("leaves the children interactive while under the limit", () => {
    setQuota({ ai_chat_used: 5, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("composer").closest("[inert]")).toBeNull();
  });

  // The real composer is a div inside a div, so React reuses the gate's own DOM
  // nodes for it once the paywall lifts. Whatever the gate set imperatively has
  // to be taken back, or a user who just upgraded cannot type until a reload.
  it("gives the composer back when the paywall lifts", () => {
    const tree = () => (
      <MemoryRouter>
        <AIQuotaGate usageType="chat">
          <div>
            <div>
              <textarea aria-label="composer" />
            </div>
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    expect(screen.queryByLabelText("composer")).not.toBeInTheDocument();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("composer").closest("[inert]")).toBeNull();
  });

  it("moves focus to the paywall when the limit runs out in front of the user", () => {
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = renderGate();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(gateTree());
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAccessibleDescription(/You've used all your AI messages/);
    // Focus already reads the panel: the region does not say it a second time.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  // Same div-in-div shape as the real composer: the outer nodes are reused on
  // the flip, so this would catch the textarea surviving it with focus inside
  // an inert subtree.
  it("moves focus to the paywall when it was in the composer", () => {
    const tree = () => (
      <MemoryRouter>
        <AIQuotaGate usageType="chat">
          <div>
            <div>
              <textarea aria-label="composer" />
            </div>
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    screen.getByLabelText("composer").focus();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toHaveFocus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    // A refetch while the paywall stays up announces nothing new.
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("leaves focus alone when the user is typing elsewhere on the page", () => {
    const tree = () => (
      <MemoryRouter>
        <input aria-label="elsewhere" />
        <AIQuotaGate usageType="chat">
          <button type="button">composer</button>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    screen.getByLabelText("elsewhere").focus();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });

  it("does not take focus on the first answer after the quota went unknown", () => {
    setQuota({ ai_chat_used: 5, ai_chat_limit: 50 });
    const { rerender } = renderGate();
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    rerender(gateTree());
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(gateTree());
    expect(screen.getByRole("alertdialog")).not.toHaveFocus();
  });

  it("does not take focus when the paywall is already up on page load", () => {
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByRole("alertdialog")).not.toHaveFocus();
  });

  it("does not take focus when the first quota answer is already exhausted", () => {
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    const { rerender } = renderGate();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(gateTree());
    expect(screen.getByRole("alertdialog")).not.toHaveFocus();
  });

  it("announces the paywall through a live region that exists before it", () => {
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    const { rerender } = renderGate();
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(gateTree());
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("AI chat limit reached");
  });

  // The quota is usually cached (the top bar reads it on every page), so the
  // gate often mounts with the paywall already up. The region must still start
  // empty on that first paint, or there is no change for a screen reader to read.
  it("starts the region empty on the first paint even with a cached exhausted quota", () => {
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    const firstPaint = document.createElement("div");
    firstPaint.innerHTML = renderToStaticMarkup(gateTree());
    expect(firstPaint.querySelector('[role="status"]')).toBeEmptyDOMElement();
    renderGate();
    expect(screen.getByRole("status")).toHaveTextContent("AI chat limit reached");
  });

  it("lets an alert panel announce itself instead of the region", () => {
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    const { rerender } = renderGate();
    setQuota({ plan_code: "brigade", ai_chat_used: 2000, ai_chat_limit: 2000 });
    rerender(gateTree());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces the paywall when the limit runs out while focus is on another control", () => {
    const tree = () => (
      <MemoryRouter>
        <button type="button">chip</button>
        <AIQuotaGate usageType="chat">
          <button type="button">composer</button>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    screen.getByText("chip").focus();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByText("chip")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("AI chat limit reached");
  });

  it("is an alert, not an alertdialog, when the panel has no enabled control", () => {
    setQuota({ plan_code: "brigade", ai_chat_used: 2000, ai_chat_limit: 2000 });
    const { unmount } = renderGate();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAccessibleName("AI chat limit reached");
    unmount();
    billing.enabled = false;
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("returns focus to the composer when the paywall lifts while focus is on it", () => {
    const tree = () => (
      <MemoryRouter>
        <AIQuotaGate usageType="chat">
          <div>
            <div>
              <textarea aria-label="composer" />
            </div>
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toHaveFocus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("composer")).toHaveFocus();
  });

  it("leaves focus alone when the paywall lifts while focus is elsewhere", () => {
    const tree = () => (
      <MemoryRouter>
        <input aria-label="elsewhere" />
        <AIQuotaGate usageType="chat">
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    screen.getByLabelText("elsewhere").focus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });

  it("leaves focus alone when the paywall lifts after focus moved off it", () => {
    const tree = () => (
      <MemoryRouter>
        <input aria-label="elsewhere" />
        <AIQuotaGate usageType="chat">
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toHaveFocus();
    screen.getByLabelText("elsewhere").focus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });

  it("does not take focus back after the panel vanished with the quota going unknown", () => {
    const tree = () => (
      <MemoryRouter>
        <input aria-label="elsewhere" />
        <AIQuotaGate usageType="chat">
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toHaveFocus();
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    rerender(tree());
    screen.getByLabelText("elsewhere").focus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });

  it("does not take focus on a second lift after the first one handed it back", () => {
    const tree = () => (
      <MemoryRouter>
        <input aria-label="elsewhere" />
        <AIQuotaGate usageType="chat">
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("alertdialog")).toHaveFocus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("composer")).toHaveFocus();
    screen.getByLabelText("elsewhere").focus();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
    setQuota({ ai_chat_used: 0, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByLabelText("elsewhere")).toHaveFocus();
  });

  it("clears the region while the quota is unknown and announces the paywall again after", () => {
    const tree = () => (
      <MemoryRouter>
        <button type="button">chip</button>
        <AIQuotaGate usageType="chat">
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50 });
    const { rerender } = render(tree());
    screen.getByText("chip").focus();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("status")).toHaveTextContent("AI chat limit reached");
    mockedUseTierQuota.mockReturnValue(
      { data: undefined } as unknown as ReturnType<typeof useTierQuota>,
    );
    rerender(tree());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    rerender(tree());
    expect(screen.getByRole("status")).toHaveTextContent("AI chat limit reached");
  });

  it("announces another slot's paywall when the gate switches to it", () => {
    const tree = (usageType: "chat" | "photo") => (
      <MemoryRouter>
        <button type="button">chip</button>
        <AIQuotaGate usageType={usageType}>
          <div>
            <textarea aria-label="composer" />
          </div>
        </AIQuotaGate>
      </MemoryRouter>
    );
    setQuota({ ai_chat_used: 49, ai_chat_limit: 50, ai_photo_used: 1, ai_photo_limit: 1 });
    const { rerender } = render(tree("chat"));
    screen.getByText("chip").focus();
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50, ai_photo_used: 1, ai_photo_limit: 1 });
    rerender(tree("chat"));
    expect(screen.getByRole("status")).toHaveTextContent("AI chat limit reached");
    rerender(tree("photo"));
    const photoTitle = screen.getByRole("heading").textContent ?? "";
    expect(photoTitle).not.toBe("AI chat limit reached");
    expect(screen.getByRole("status")).toHaveTextContent(photoTitle);
  });

  it("renders children unobstructed when under the limit", () => {
    setQuota({ ai_chat_used: 5, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("composer")).toBeInTheDocument();
    expect(screen.queryByText("AI chat limit reached")).not.toBeInTheDocument();
  });

  it("shows the paywall overlay and priced CTA when the slot is exhausted and billing is on", () => {
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("AI chat limit reached")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Master for 990 ₽")).toBeInTheDocument();
  });

  it("shows a disabled 'soon' affordance instead of checkout when billing is off", () => {
    billing.enabled = false;
    setQuota({ ai_chat_used: 50, ai_chat_limit: 50 });
    renderGate();
    expect(screen.getByText("AI chat limit reached")).toBeInTheDocument();
    expect(screen.queryByText("Upgrade to Master for 990 ₽")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Soon" })).toBeDisabled();
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
