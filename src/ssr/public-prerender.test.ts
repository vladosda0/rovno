// site-redesign 1.2 + 1.3: the public pages reach a crawler as ready HTML.
// renderPublicPage is the same React tree the browser renders; the injector is
// what scripts/prerender-public.mjs writes into dist after `vite build`.
import { describe, expect, it } from "vitest";
import { renderPublicPage } from "@/ssr/public-pages";
import {
  injectPublicPage,
  normalizeRoute,
  stripPublicPage,
} from "../../scripts/lib/public-prerender.mjs";

const TEMPLATE = `<!doctype html>
<html lang="ru">
  <head>
    <title>Ровно ИИ — управление строительными проектами</title>
    <meta name="description" content="старое" />
    <meta property="og:title" content="старое" />
    <meta property="og:description" content="старое" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="https://rovno.ai/rovno-logo.png" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="старое" />
    <link rel="canonical" href="https://rovno.ai/offer/" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index.js"></script>
  </body>
</html>`;

const LEGAL = [
  { route: "/offer/", title: "Публичная оферта — Ровно", h1: "Публичная оферта", text: "Термины и определения" },
  { route: "/privacy/", title: "Политика конфиденциальности — Ровно", h1: "Политика конфиденциальности", text: "персональных данных" },
  { route: "/refund/", title: "Возврат средств — Ровно", h1: "Возврат средств", text: "возврат" },
  { route: "/contacts/", title: "Контакты — Ровно", h1: "Контакты", text: "Служба поддержки" },
] as const;

function jsonLdTypes(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(
    (match) => {
      const value = JSON.parse(match[1]);
      return (Array.isArray(value) ? value : [value]).map((block: { "@type": string }) => block["@type"]);
    },
  );
}

describe("public pages prerender", () => {
  it.each(LEGAL)("$route carries its own title, description, canonical, h1 and text", (page) => {
    const rendered = renderPublicPage(page.route);
    const html = injectPublicPage(TEMPLATE, { ...rendered, cssAssets: [] });

    expect(html).toContain(`<title>${page.title}</title>`);
    expect(html).not.toContain("Ровно ИИ — управление строительными проектами");
    expect(html).toContain(`<meta property="og:title" content="${page.title}" />`);
    expect(html).toMatch(new RegExp(`<meta name="description" content="[^"]{40,}" />`));
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="https://rovno.ai${page.route}" />`);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${page.h1}</h1>`));
    expect(html.toLowerCase()).toContain(page.text.toLowerCase());
    expect(html).toContain(`data-prerendered-route="${page.route}"`);
  });

  it("leaves the landing canonical to prerender-blog and never stamps og:url on the SPA fallback", () => {
    const withCanonical = TEMPLATE.replace("https://rovno.ai/offer/", "https://rovno.ai/");
    const html = injectPublicPage(withCanonical, { ...renderPublicPage("/"), cssAssets: [] });
    expect(html.match(/<link rel="canonical"/g)).toHaveLength(1);
    expect(html).not.toContain("og:url");
    const bare = injectPublicPage(TEMPLATE.replace(/\s*<link rel="canonical"[^>]*>/, ""), { ...renderPublicPage("/"), cssAssets: [] });
    expect(bare).not.toContain('rel="canonical"');
  });

  it("titles differ on every public route", () => {
    const titles = ["/", ...LEGAL.map((page) => page.route)].map((route) => renderPublicPage(route).head.title);
    expect(new Set(titles).size).toBe(5);
  });

  it("hides the ready markup before paint on any other address (SPA fallback)", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/offer/"), cssAssets: [] });
    const guard = html.match(/<script>([\s\S]*?data-rv-prerender-off[\s\S]*?)<\/script>/);
    expect(guard).not.toBeNull();
    expect(html).toContain("html[data-rv-prerender-off] [data-prerendered-route]{display:none!important}");
    // The guard must run in <head>, before the markup is parsed.
    expect(html.indexOf("data-rv-prerender-off")).toBeLessThan(html.indexOf("<body>"));

    for (const [pathname, hidden] of [
      ["/offer", false],
      ["/offer/", false],
      ["/home", true],
      ["/offer/x", true],
    ] as const) {
      const root = { attrs: {} as Record<string, string>, setAttribute(k: string, v: string) { this.attrs[k] = v; } };
      new Function("location", "document", guard![1])({ pathname }, { documentElement: root });
      expect("data-rv-prerender-off" in root.attrs, pathname).toBe(hidden);
    }
  });

  it("links the css chunks it is given, through the guard", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/offer/"), cssAssets: ["/assets/Site-abc.css"] });
    expect(html).toContain("/assets/Site-abc.css");
  });

  it("is idempotent: a second run does not stack head tags or markup", () => {
    const page = { ...renderPublicPage("/offer/"), cssAssets: ["/assets/Site-abc.css"] };
    const once = injectPublicPage(TEMPLATE, page);
    const twice = injectPublicPage(once, page);
    expect(twice).toBe(once);
  });

  it("refuses a template whose #root is not the empty app shell", () => {
    expect(() => injectPublicPage(TEMPLATE.replace('<div id="root"></div>', "<main></main>"), {
      ...renderPublicPage("/offer/"),
      cssAssets: [],
    })).toThrow(/root/);
  });

  it("gives the template back to prerender-blog and prerender-kb on a rerun (review round 1)", () => {
    const shell = TEMPLATE.replace("https://rovno.ai/offer/", "https://rovno.ai/");
    const filled = injectPublicPage(shell, { ...renderPublicPage("/"), cssAssets: ["/assets/Site-abc.css"] });
    const restored = stripPublicPage(filled);
    expect(restored).toContain('<div id="root"></div>');
    expect(restored).not.toContain("data-prerendered-route");
    expect(restored).not.toContain("rv-prerender-head");
    expect(restored).not.toContain("application/ld+json");
    expect(stripPublicPage(shell)).toBe(shell);
  });

  it("loads the site stylesheet only on the page's own address, not on every app route (review round 1)", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/"), cssAssets: ["/assets/Site-abc.css"] });
    // Outside <noscript> the stylesheet is never linked directly.
    expect(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")).not.toContain('<link rel="stylesheet" href="/assets/Site-abc.css" />');
    const guard = html.match(/<script>([\s\S]*?data-rv-prerender-off[\s\S]*?)<\/script>/)![1];
    for (const [pathname, loads] of [["/", true], ["/home", false], ["/share/report/x", false]] as const) {
      const written: string[] = [];
      const root = { setAttribute() {} };
      new Function("location", "document", guard)({ pathname }, { documentElement: root, write: (t: string) => written.push(t) });
      expect(written.join("").includes("/assets/Site-abc.css"), pathname).toBe(loads);
    }
  });

  it("keeps the site stylesheet for visitors without JavaScript (review round 2)", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/"), cssAssets: ["/assets/Site-abc.css"] });
    expect(html).toContain('<noscript><link rel="stylesheet" href="/assets/Site-abc.css" /></noscript>');
  });

  it("keeps prices out of the landing description: it is also the preview of every shared link (review round 1)", () => {
    expect(renderPublicPage("/").head.description).not.toMatch(/₽|990/);
  });

  it("normalizes routes the way the static host resolves them", () => {
    expect(normalizeRoute("/offer")).toBe("/offer");
    expect(normalizeRoute("/offer/")).toBe("/offer");
    expect(normalizeRoute("/")).toBe("/");
    expect(normalizeRoute("")).toBe("/");
  });
});

describe("public pages JSON-LD and link card (1.3)", () => {
  it("the landing carries Organization with requisites and sameAs, and WebSite", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/"), cssAssets: [] });
    expect(jsonLdTypes(html)).toEqual(["Organization", "WebSite"]);
    const org = JSON.parse(html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)![1]);
    expect(org.taxID).toBe("575309671587");
    expect(org.identifier.value).toBe("326470400066950");
    expect(org.address.postalCode).toBe("188824");
    expect(org.telephone).toBe("+79215599969");
    expect(org.sameAs).toEqual(expect.arrayContaining(["https://t.me/stroyrovno", "https://vk.ru/rovnoai", "https://t.me/ai_v_stroike"]));
    expect(org.sameAs).toHaveLength(5);
  });

  it.each(LEGAL)("$route carries Organization and BreadcrumbList", (page) => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage(page.route), cssAssets: [] });
    expect(jsonLdTypes(html)).toEqual(["Organization", "BreadcrumbList"]);
  });

  it("uses the 1200x630 link card with a large twitter card", () => {
    const html = injectPublicPage(TEMPLATE, { ...renderPublicPage("/"), cssAssets: [] });
    expect(html).toContain('<meta property="og:image" content="https://rovno.ai/og-image.png" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});
