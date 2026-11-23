// site-redesign 1.5-1.7: the new landing, its header and footer, and motion.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lenisCtor = vi.fn();
vi.mock("lenis", () => ({
  default: class {
    isStopped = false;
    constructor(options: unknown) {
      lenisCtor(options);
    }
    stop() {}
    start() {}
    destroy() {}
  },
}));

// planHref follows VITE_BILLING_ENABLED; CI sets no value, so pin it here
// (both states are asserted explicitly in the billing-off test).
vi.mock("@/lib/billing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing")>()),
  BILLING_ENABLED: true,
}));

import { SiteLanding } from "@/components/site/SiteLanding";
import { planHref } from "@/components/site/SiteSections";
import { renderPublicPage } from "@/ssr/public-pages";

const POSTS = [
  { slug: "one", title: "Первая статья", excerpt: "Коротко о первой", published_at: "2026-11-20T10:00:00Z", reading_time_minutes: 4, cover_image_url: null },
  { slug: "two", title: "Вторая статья", excerpt: null, published_at: null, reading_time_minutes: null, cover_image_url: "https://example.test/c.webp" },
];

function setMotion({ reduce, fine }: { reduce: boolean; fine: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduced-motion") ? reduce : query.includes("pointer") ? fine : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("new landing (1.6)", () => {
  beforeEach(() => {
    setMotion({ reduce: true, fine: false });
    vi.stubGlobal("IntersectionObserver", IO);
    lenisCtor.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the designer's sections with the hero heading", () => {
    const { container } = render(<SiteLanding posts={POSTS} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Управляйте стройкой,");
    for (const id of ["problem", "resources", "features", "planning", "issues", "budget", "documents", "team", "shurik", "audience", "pricing", "faq", "blog", "start"]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
    for (const who of ["Прорабы и бригады", "Частные мастера", "Заказчики ремонта", "Строительные компании"]) {
      expect(screen.getByText(who)).toBeTruthy();
    }
  });

  it("prices plans from the catalog as «Старт 0 · Мастер 990 · Бригада 2 990» without struck prices", () => {
    const { container } = render(<SiteLanding />);
    const pricing = container.querySelector("#pricing") as HTMLElement;
    const cards = pricing.querySelectorAll(".plan-card");
    expect(cards).toHaveLength(3);
    expect([...cards].map((card) => card.querySelector("h3")?.textContent)).toEqual(["Старт", "Мастер", "Бригада"]);
    expect([...cards].map((card) => card.querySelector(".plan-price > span")?.textContent)).toEqual(["0", "990", "2 990"]);
    expect(pricing.querySelector("s")).toBeNull();
    expect([...cards].map((card) => card.querySelector(".plan-plus")?.textContent)).toEqual([
      "Что входит:",
      "Всё из Старта, плюс:",
      "Всё из Мастера, плюс:",
    ]);
    // Every card ends with its «Продолжить» button (one line by CSS).
    cards.forEach((card) => expect(card.querySelector(".plan-bottom > a:last-child")?.textContent).toContain("Продолжить"));
    expect(within(pricing).getByText("Финансы и аналитика по всем объектам")).toBeTruthy();
    expect(within(pricing).getByText("ИИ-маркетолог продвигает компанию · Скоро").closest("li")?.className).toBe("plan-feature--soon");
  });

  it("sends a guest to sign up and a signed-in person to the checkout", () => {
    const { container, rerender } = render(<SiteLanding />);
    const hrefs = () => [...container.querySelectorAll("#pricing .plan-bottom > a")].map((a) => a.getAttribute("href"));
    expect(hrefs()).toEqual([
      "/auth/signup",
      "/auth/signup?next=%2Fbilling%2Fcheckout%3Fplan%3Dmaster",
      "/auth/signup?next=%2Fbilling%2Fcheckout%3Fplan%3Dbrigade",
    ]);
    rerender(<SiteLanding cta={{ startPath: "/home", loginPath: "/home", signedIn: true }} />);
    expect(hrefs()).toEqual(["/home", "/billing/checkout?plan=master", "/billing/checkout?plan=brigade"]);
  });

  it("sends a paid plan to the billing settings while online payment is off (review round 1)", () => {
    const signedIn = { startPath: "/home", loginPath: "/home", signedIn: true };
    expect(planHref("master", signedIn, false)).toBe("/settings?tab=billing");
    expect(planHref("brigade", { ...signedIn, signedIn: false, startPath: "/auth/signup" }, false)).toBe(
      "/auth/signup?next=%2Fsettings%3Ftab%3Dbilling",
    );
    expect(planHref("master", signedIn, true)).toBe("/billing/checkout?plan=master");
  });

  it("reports the plan click for the funnel goal", () => {
    const onPlanClick = vi.fn();
    const { container } = render(<SiteLanding onPlanClick={onPlanClick} />);
    const buttons = container.querySelectorAll("#pricing .plan-bottom > a");
    buttons.forEach((button) => button.addEventListener("click", (event) => event.preventDefault()));
    fireEvent.click(buttons[1]);
    expect(onPlanClick).toHaveBeenCalledWith("master");
  });

  it("feeds the three latest articles into a horizontal-only strip, and hides the block with none", () => {
    const { container, rerender } = render(<SiteLanding posts={POSTS} />);
    const strip = container.querySelector(".blog-posts") as HTMLElement;
    expect([...strip.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/blog/one/", "/blog/two/"]);
    expect(within(strip).getByText("4 мин чтения")).toBeTruthy();
    rerender(<SiteLanding posts={[]} />);
    expect(container.querySelector("#blog")).toBeNull();
  });

  it("adds no hreflang pair (no English version yet)", () => {
    render(<SiteLanding />);
    expect(document.head.querySelector('link[hreflang]')).toBeNull();
  });
});

describe("new header and footer (1.5)", () => {
  beforeEach(() => {
    setMotion({ reduce: true, fine: false });
    vi.stubGlobal("IntersectionObserver", IO);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("navigates with real links, «База знаний» included", () => {
    const { container } = render(<SiteLanding />);
    const nav = container.querySelector(".desktop-navigation") as HTMLElement;
    expect([...nav.querySelectorAll("a")].map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Возможности", "/#features"],
      ["Для кого", "/#audience"],
      ["Тарифы", "/#pricing"],
      ["FAQ", "/#faq"],
      ["Блог", "/blog/"],
      ["База знаний", "/baza/"],
    ]);
    expect(nav.querySelector("button")).toBeNull();
  });

  it("lists socials as «name · group» rows, without the MAX row until it has a public link", () => {
    const { container } = render(<SiteLanding />);
    const columns = container.querySelectorAll(".footer-column");
    const socials = [...columns].find((column) => column.querySelector("h2")?.textContent === "Социальные сети")!;
    const rows = [...socials.querySelectorAll("li")].map((li) => [li.querySelector("a")?.textContent, li.querySelector(".footer-social-group")?.textContent]);
    expect(rows).toEqual([
      ["Telegram", "Ровно"],
      ["ВКонтакте", "Ровно"],
      ["Дзен", "Ровно"],
      ["Telegram", "Шурик, ИИ-эксперт"],
      ["Threads", "Шурик, ИИ-эксперт"],
    ]);
    socials.querySelectorAll("a").forEach((a) => expect(a.getAttribute("href")).toMatch(/^https:\/\//));
    // No subheadings inside the column: they broke the row grid.
    expect(socials.querySelectorAll("h3")).toHaveLength(0);
  });

  it("keeps the requisites row, the legal links and «Настройки cookie»", () => {
    const { container } = render(<SiteLanding />);
    const footer = container.querySelector("footer") as HTMLElement;
    expect(within(footer).getByText("ИП Горлов В. А.")).toBeTruthy();
    expect(within(footer).getByText("ИНН 575309671587")).toBeTruthy();
    expect(within(footer).getByText("© 2026 ровно")).toBeTruthy();
    for (const href of ["/offer/", "/privacy/", "/refund/", "/contacts/"]) {
      expect(footer.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    expect(within(footer).getByRole("button", { name: "Настройки cookie" })).toBeTruthy();
  });

  it("calls to action follow the auth state", () => {
    const { container, rerender } = render(<SiteLanding />);
    const actions = () => [...container.querySelectorAll(".header-actions a")].map((a) => a.getAttribute("href"));
    expect(actions()).toEqual(["/auth/login", "/demo"]);
    rerender(<SiteLanding cta={{ startPath: "/home", loginPath: "/home", signedIn: true }} />);
    expect(actions()).toEqual(["/home", "/demo"]);
  });
});

describe("motion and cursor (1.7)", () => {
  let animate: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", IO);
    animate = vi.fn(() => ({ pause() {}, play() {}, cancel() {}, currentTime: 0, onfinish: null }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    lenisCtor.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("with prefers-reduced-motion: no reveal, no card assembly animation, no bubbles, no Lenis", () => {
    setMotion({ reduce: true, fine: true });
    render(<SiteLanding />);
    const animatedNonResources = animate.mock.contexts.filter(
      (element: HTMLElement) => !element.closest(".resources-block"),
    );
    expect(animatedNonResources).toHaveLength(0);
    expect(lenisCtor).not.toHaveBeenCalled();
  });

  it("does not hide again what the ready HTML already painted on screen (review round 1)", async () => {
    setMotion({ reduce: false, fine: true });
    const { capturePrerenderSnapshot, resetPrerenderSnapshot } = await import("@/lib/prerender-snapshot");
    const holder = document.createElement("div");
    holder.id = "root";
    holder.innerHTML = '<div data-prerendered-route="/"><h1>x</h1></div>';
    document.body.appendChild(holder);
    capturePrerenderSnapshot(document);
    holder.remove();
    const rect = { top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} };
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    const { unmount } = render(<SiteLanding />);
    const hero = document.querySelector(".hero h1") as HTMLElement;
    expect(animate.mock.contexts).not.toContain(hero);
    // Once per cold load: the snapshot is gone after the first mount ...
    const { prerenderedHtmlFor } = await import("@/lib/prerender-snapshot");
    expect(prerenderedHtmlFor("/")).toBeNull();
    // ... so an in-app return to the landing plays the first-screen entrance (review round 3).
    unmount();
    animate.mockClear();
    render(<SiteLanding />);
    expect(animate.mock.contexts).toContain(document.querySelector(".hero h1"));
    spy.mockRestore();
    resetPrerenderSnapshot();
  });

  it("with motion allowed and a mouse: reveal animations and Lenis start", () => {
    setMotion({ reduce: false, fine: true });
    render(<SiteLanding />);
    expect(animate).toHaveBeenCalled();
    expect(lenisCtor).toHaveBeenCalledTimes(1);
  });

  it("the custom cursor marks only the .rv-site scope, never <html>", () => {
    setMotion({ reduce: false, fine: true });
    const { container } = render(<SiteLanding />);
    document.elementFromPoint = () => container.querySelector("h1");
    fireEvent.pointerMove(document, { clientX: 10, clientY: 10, pointerType: "mouse" });
    expect(container.querySelector(".rv-site")?.getAttribute("data-custom-cursor")).toBe("true");
    expect(document.documentElement.hasAttribute("data-custom-cursor")).toBe(false);
  });
});

describe("landing ready HTML (1.6)", () => {
  it("carries the h1, the plans and the navigation as links", () => {
    const { rootHtml, head } = renderPublicPage("/", { posts: POSTS });
    expect(head.title).toBe("Ровно — управляйте стройкой, а не хаосом");
    expect(rootHtml).toMatch(/<h1[^>]*>[\s\S]*Управляйте[\s\S]*а не хаосом\.[\s\S]*<\/h1>/);
    for (const text of ["Старт", "Мастер", "Бригада", "990", "2 990", "Первая статья"]) {
      expect(rootHtml).toContain(text);
    }
    expect(rootHtml).toContain('href="/#pricing"');
    expect(rootHtml).toContain('href="/baza/"');
    expect(rootHtml).toContain('href="/blog/one/"');
  });
});
