import { describe, expect, it } from "vitest";
import ruLocale from "@/locales/ru.json";
import {
  createTranslator,
  fallbackShellWithoutKbPages,
  escapeHtml,
  kbDocumentRootHtml,
  kbPageHtml,
  kbSitemapUrls,
  mergeIntoSitemap,
  stripCanonicalTags,
} from "./kbPrerenderConfig.mjs";

const t = createTranslator(ruLocale as Record<string, string>);

const ROW = {
  doc_id: "SP-71",
  slug: "sp-71-13330",
  designation: "СП 71.13330",
  title: "Изоляционные & отделочные <покрытия>",
  category: "Свод правил",
  folder: "sp",
  display_mode: "full_text",
  object_types: ["ремонт квартир и домов"],
  domains: [],
  applicability_note: null,
  publisher: "",
  country: null,
  edition: "2017 с изменениями 1-4",
  effective_from: null,
  last_checked_at: "2026-10-13",
  source_links: [
    { url: "https://www.consultant.ru/document/x/", kind: "copy" },
    { url: "javascript:alert(1)", kind: "official" },
    { url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" },
  ],
  full_text_available: false,
  updated_at: "2026-10-19T22:00:00+00:00",
};

const TEMPLATE = `<!doctype html><html lang="ru"><head>
    <title>Ровно</title>
    <meta name="description" content="landing" />
    <meta property="og:title" content="landing" />
    <meta property="og:description" content="landing" />
    <meta property="og:type" content="website" />
    <meta name="twitter:title" content="landing" />
    <link rel="canonical" href="https://rovno.ai/" />
  </head><body><div id="root"></div></body></html>`;

describe("createTranslator", () => {
  it("resolves flat keys and interpolates", () => {
    expect(t("home.knowledgeBase.source.generic", { host: "normacs.ru" })).toBe("Открыть на сайте normacs.ru");
    expect(t("missing.key")).toBe("missing.key");
  });
});

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });
});

describe("kbDocumentRootHtml", () => {
  const html = kbDocumentRootHtml(ROW, t);

  it("renders breadcrumb, escaped heading, facts and the full-text note", () => {
    expect(html).toContain("База знаний");
    expect(html).toContain("Своды правил");
    expect(html).toContain("<h1 class=\"rv-article-title\">СП 71.13330 · Изоляционные &amp; отделочные &lt;покрытия&gt;</h1>");
    expect(html).toContain("<dt>Для чего</dt><dd>ремонт квартир и домов</dd>");
    expect(html).toContain("<dt>Проверено</dt><dd>13.10.2026</dd>");
    expect(html).toContain("<dt>Источник</dt><dd>Минстрой России, minstroyrf.gov.ru</dd>");
    expect(html).not.toContain("Издатель");
    expect(html).toContain("Полный текст появится в базе позже.");
  });

  it("renders source links official first, safe only, opening in a new tab", () => {
    const links = [...html.matchAll(/<a class="rv-btn[^"]*" href="([^"]+)" target="_blank" rel="noopener noreferrer">([^<]+)<\/a>/g)];
    expect(links.map((m) => [m[1], m[2]])).toEqual([
      ["https://minstroyrf.gov.ru/docs/14844/", "Открыть на сайте Минстроя"],
      ["https://www.consultant.ru/document/x/", "Открыть в КонсультантПлюс"],
    ]);
    expect(html).not.toContain("javascript:");
  });

  it("offers guests «Спросить Шурика» leading to sign-up", () => {
    expect(html).toContain('<a class="rv-btn rv-btn--secondary rv-kb-ask" href="/auth/signup">Спросить Шурика</a>');
  });
});

describe("kbPageHtml", () => {
  const html = kbPageHtml(TEMPLATE, ROW, t, ["/assets/blog.css"]);

  it("swaps title, description and a single canonical", () => {
    expect(html).toContain("<title>СП 71.13330 · Изоляционные &amp; отделочные &lt;покрытия&gt; — База знаний Ровно</title>");
    expect(html).toMatch(/<meta name="description" content="СП 71.13330 Изоляционные &amp; отделочные &lt;покрытия&gt;\. Свод правил\. Редакция: 2017/);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://rovno.ai/baza/sp-71-13330/" />');
    expect(html).toContain('<link rel="stylesheet" href="/assets/blog.css" />');
    expect(html).not.toContain('content="landing"');
  });

  it("marks the page as an article of the site, like the blog pages", () => {
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain('<meta property="og:site_name" content="Ровно ИИ" />');
    expect(html.match(/og:type/g)).toHaveLength(1);
  });

  it("inlines the row as JSON that cannot break out of the script tag", () => {
    const evil = kbPageHtml(TEMPLATE, { ...ROW, title: "</script><script>alert(1)</script>" }, t, []);
    expect(evil).toContain('<script type="application/json" id="__KB_DOC_DATA__">');
    expect(evil).not.toContain("</script><script>alert(1)");
  });

  it("is safe against $-patterns in content", () => {
    const html2 = kbPageHtml(TEMPLATE, { ...ROW, title: "$& $' $`" }, t, []);
    expect(html2).toContain("$&amp; $&#39; $`");
  });
});

describe("stripCanonicalTags", () => {
  it("drops canonical and og:url", () => {
    expect(stripCanonicalTags('<link rel="canonical" href="x" />\n<meta property="og:url" content="x" />\n<b/>')).toBe("<b/>");
  });
});

describe("sitemap", () => {
  it("builds one url per document with lastmod", () => {
    expect(kbSitemapUrls([ROW, { ...ROW, slug: "gost-1", updated_at: null }], "2026-10-20")).toEqual([
      "  <url><loc>https://rovno.ai/baza/sp-71-13330/</loc><lastmod>2026-10-19</lastmod></url>",
      "  <url><loc>https://rovno.ai/baza/gost-1/</loc><lastmod>2026-10-20</lastmod></url>",
    ]);
  });

  it("skips rows without a usable slug", () => {
    expect(kbSitemapUrls([{ ...ROW, slug: "" }, { ...ROW, slug: "a/b" }], "2026-10-20")).toEqual([]);
  });

  it("appends into the existing blog sitemap", () => {
    const blog = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://rovno.ai/</loc></url>\n</urlset>\n`;
    const merged = mergeIntoSitemap(blog, ["  <url><loc>https://rovno.ai/baza/a/</loc></url>"]);
    expect(merged).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://rovno.ai/</loc></url>\n  <url><loc>https://rovno.ai/baza/a/</loc></url>\n</urlset>\n`,
    );
  });

  it("replaces its own entries on a re-run instead of doubling them", () => {
    const once = mergeIntoSitemap(mergeIntoSitemap(null, []), ["  <url><loc>https://rovno.ai/baza/a/</loc><lastmod>2026-10-20</lastmod></url>"]);
    const twice = mergeIntoSitemap(once, ["  <url><loc>https://rovno.ai/baza/a/</loc><lastmod>2026-10-20</lastmod></url>"]);
    expect(twice.match(/baza\/a\//g)).toHaveLength(1);
  });

  it("creates a sitemap when there is none", () => {
    const merged = mergeIntoSitemap(null, ["  <url><loc>https://rovno.ai/baza/a/</loc></url>"]);
    expect(merged).toContain("<urlset");
    expect(merged).toContain("https://rovno.ai/baza/a/");
  });
});

describe("fallbackShellWithoutKbPages (the landing-canonical guard)", () => {
  const stamped = TEMPLATE;

  it("strips the landing canonical from the SPA fallback when the KB fetch failed and no page was written", () => {
    const out = fallbackShellWithoutKbPages(stamped, { pagesWritten: 0, fetchFailed: true });
    expect(out).not.toBeNull();
    expect(out).not.toContain('rel="canonical"');
    expect(out).toContain("<title>Ровно</title>");
  });

  it("leaves the fallback alone when KB pages exist", () => {
    expect(fallbackShellWithoutKbPages(stamped, { pagesWritten: 12, fetchFailed: false })).toBeNull();
    expect(fallbackShellWithoutKbPages(stamped, { pagesWritten: 12, fetchFailed: true })).toBeNull();
  });

  it("keeps the landing canonical when the base is healthy but empty or not deployed yet", () => {
    expect(fallbackShellWithoutKbPages(stamped, { pagesWritten: 0, fetchFailed: false })).toBeNull();
  });

  it("does nothing when the fallback carries no canonical", () => {
    expect(fallbackShellWithoutKbPages(stripCanonicalTags(stamped), { pagesWritten: 0, fetchFailed: true })).toBeNull();
  });
});
