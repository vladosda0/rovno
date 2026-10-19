import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Pricing } from "@/components/landing/LandingSections";
import { trackEvent } from "@/lib/analytics";

const flags = vi.hoisted(() => ({ billingEnabled: false }));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
  trackEventOncePerSession: vi.fn(),
}));

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return {
    ...actual,
    get BILLING_ENABLED() {
      return flags.billingEnabled;
    },
  };
});

function renderPricing(props: { startPath: string; isAuthed?: boolean }) {
  render(
    <MemoryRouter>
      <Pricing {...props} />
    </MemoryRouter>,
  );
  return screen.getAllByRole("link").map((link) => link.getAttribute("href"));
}

describe("pricing card CTAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    flags.billingEnabled = false;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn();
      },
    );
  });

  it("keeps the free card on the start path", () => {
    const [free] = renderPricing({ startPath: "/auth/signup" });
    expect(free).toBe("/auth/signup");
  });

  it("sends a guest through signup to the billing settings while checkout is off", () => {
    const [, master, brigade] = renderPricing({ startPath: "/auth/signup" });
    expect(master).toBe(`/auth/signup?next=${encodeURIComponent("/settings?tab=billing")}`);
    expect(brigade).toBe(`/auth/signup?next=${encodeURIComponent("/settings?tab=billing")}`);
  });

  it("sends a guest through signup to the chosen plan's checkout when checkout is on", () => {
    flags.billingEnabled = true;
    const [, master, brigade] = renderPricing({ startPath: "/auth/signup" });
    expect(master).toBe(`/auth/signup?next=${encodeURIComponent("/billing/checkout?plan=master")}`);
    expect(brigade).toBe(`/auth/signup?next=${encodeURIComponent("/billing/checkout?plan=brigade")}`);
  });

  it("sends a signed-in visitor straight to checkout or the billing settings", () => {
    flags.billingEnabled = true;
    expect(renderPricing({ startPath: "/home", isAuthed: true }).slice(1, 3)).toEqual([
      "/billing/checkout?plan=master",
      "/billing/checkout?plan=brigade",
    ]);
  });

  it("sends a signed-in visitor to the billing settings while checkout is off", () => {
    expect(renderPricing({ startPath: "/home", isAuthed: true }).slice(1, 3)).toEqual([
      "/settings?tab=billing",
      "/settings?tab=billing",
    ]);
  });

  it("records the chosen paid plan once per click and nothing for the free card", () => {
    renderPricing({ startPath: "/auth/signup" });
    const links = screen.getAllByRole("link");
    fireEvent.click(links[0]);
    expect(trackEvent).not.toHaveBeenCalled();
    fireEvent.click(links[2]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("billing_plan_selected", { plan: "brigade" });
  });
});
