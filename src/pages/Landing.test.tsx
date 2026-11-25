// site-redesign 1.6: the landing page wiring — funnel goals, auth-aware CTAs,
// real articles.
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const trackEvent = vi.fn();
const trackEventOncePerSession = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  trackEventOncePerSession: (...args: unknown[]) => trackEventOncePerSession(...args),
}));
let authStatus = "anonymous";
vi.mock("@/hooks/use-runtime-auth", () => ({ useRuntimeAuth: () => ({ status: authStatus }) }));
vi.mock("@/hooks/use-blog", () => ({
  usePublishedBlogPosts: () => ({ data: [{ slug: "s", title: "Статья из базы", excerpt: "e", published_at: null, reading_time_minutes: 3, cover_image_url: null }] }),
}));
vi.mock("lenis", () => ({ default: class { destroy() {} stop() {} start() {} } }));

let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
class FakeIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    if (!observerCallback) observerCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

import Landing from "@/pages/Landing";

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing page", () => {
  beforeEach(() => {
    trackEvent.mockClear();
    trackEventOncePerSession.mockClear();
    observerCallback = null;
    authStatus = "anonymous";
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  it("fires landing_view once on open", () => {
    renderLanding();
    expect(trackEvent).toHaveBeenCalledWith("landing_view");
  });

  it("fires billing_plan_selected on a paid plan, not on «Старт»", () => {
    const { container } = renderLanding();
    const buttons = [...container.querySelectorAll("#pricing .plan-bottom > a")];
    buttons.forEach((button) => button.addEventListener("click", (event) => event.preventDefault()));
    fireEvent.click(buttons[0]);
    expect(trackEvent).not.toHaveBeenCalledWith("billing_plan_selected", expect.anything());
    fireEvent.click(buttons[2]);
    expect(trackEvent).toHaveBeenCalledWith("billing_plan_selected", { plan: "brigade" });
  });

  it("shows the articles from the blog", () => {
    const { container } = renderLanding();
    expect(container.querySelector('.blog-posts a[href="/blog/s/"]')?.textContent).toContain("Статья из базы");
  });

  it("sends a signed-in person to the app", () => {
    authStatus = "authenticated";
    const { container } = renderLanding();
    expect(container.querySelector(".hero-actions a")?.getAttribute("href")).toBe("/home");
    expect(container.querySelector(".header-actions a")?.textContent).toContain("Мои проекты");
  });
});
