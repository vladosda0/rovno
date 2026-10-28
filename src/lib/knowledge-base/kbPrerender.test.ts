import { describe, expect, it } from "vitest";
import ruLocale from "@/locales/ru.json";
import {
  createTranslator,
  fallbackShellWithoutKbPages,
  escapeHtml,
  KB_RESERVED_SLUGS,
  kbDocumentRootHtml,
  kbIndexPageHtml,
  kbPageHtml,
  kbSolutionPages,
  kbSolutionSitemapUrls,
  kbSitemapUrls,
  mergeIntoSitemap,
  stripCanonicalTags,
} from "./kbPrerenderConfig.mjs";
import { kbLlmsSection } from "./kbSeo.mjs";
import { normalizeKbSolution } from "./kbSolutions.mjs";
import { SEAMS_ROW, SOLUTION_ROW, solutionRow } from "./kbSolutions.fixture";

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

describe("full text in the static page (docs-library slice 2, step 2.6)", () => {
  const FULL = {
    ...ROW,
    full_text_available: true,
    text_label: "checking",
    text_base_year: 2017,
    edition_date: "2017-08-28",
    text_checked_at: "2026-10-22",
    text_source_url: "https://minstroyrf.gov.ru/docs/14844/",
    pending_amendments: [{ no: 1, url: "https://minstroyrf.gov.ru/docs/17946/" }],
  };
  const CLAUSES = [
    { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1 },
    { anchor: "p-4-7", number: "4.7", level: 2, heading: null, body: "Учет работ <ведут> в журнале.", position: 2 },
  ];

  it("puts every clause with its anchor, the label and the edition line into the HTML", () => {
    const html = kbDocumentRootHtml(FULL, t, { clauses: CLAUSES, spFullText: true });
    expect(html).toContain('<h2 id="p-4">4 Общие положения</h2>');
    expect(html).toContain('<p id="p-4-7"><strong>4.7 </strong>Учет работ &lt;ведут&gt; в журнале.</p>');
    expect(html).toContain('class="rv-kb-label rv-kb-label--checking">Проверяется</span>');
    expect(html).toContain("Текст 2017 года, без изменений № 1");
    expect(html).not.toContain(t("home.knowledgeBase.fullTextLater"));
  });

  it("with the SP switch off renders the slice-1 page: no text, the «later» line", () => {
    const html = kbDocumentRootHtml(FULL, t, { clauses: CLAUSES, spFullText: false });
    expect(html).not.toContain('id="p-4-7"');
    expect(html).not.toContain("rv-kb-label");
    expect(html).toContain(t("home.knowledgeBase.fullTextLater"));
  });

  it("writes no text block for a document without clauses", () => {
    expect(kbDocumentRootHtml(FULL, t, { clauses: [] })).not.toContain("rv-kb-text");
    expect(kbPageHtml(TEMPLATE, FULL, t, [], { clauses: CLAUSES })).toContain('id="p-4-7"');
  });
});

describe("«Решения» guest pages (docs-library slice 4, step 4.7)", () => {
  const second = solutionRow({ slug: "pol-v-sanuzle-pod-plitku", title: "Пол в санузле под плитку", updated_at: "2026-10-26T00:00:00Z" });

  it("writes nothing while no card is published", () => {
    expect(kbSolutionPages(TEMPLATE, [], t)).toEqual([]);
    expect(kbSolutionPages(TEMPLATE, [{ slug: "../x", title: "Плохой" }], t)).toEqual([]);
    expect(kbSolutionSitemapUrls([], "2026-10-28")).toEqual([]);
    expect(kbIndexPageHtml(TEMPLATE, { sp: 1 }, t)).not.toContain("/baza/resheniya/");
  });

  it("writes the folder and one page per card", () => {
    const pages = kbSolutionPages(TEMPLATE, [SOLUTION_ROW, second], t);
    expect(pages.map((p) => p.path)).toEqual([
      "/baza/resheniya/",
      "/baza/resheniya/steny-v-sanuzle-pod-plitku/",
      "/baza/resheniya/pol-v-sanuzle-pod-plitku/",
    ]);
    const folder = pages[0].html;
    expect(folder).toContain('<link rel="canonical" href="https://rovno.ai/baza/resheniya/" />');
    expect(folder).toContain('<a href="/baza/resheniya/steny-v-sanuzle-pod-plitku/">Стены в санузле под плитку</a>');
    expect(folder).toContain("2 решения");
    expect(folder).toContain('"@type":"CollectionPage"');
  });

  it("puts every case of the card into the HTML; only the default case is shown", () => {
    const html = kbSolutionPages(TEMPLATE, [SOLUTION_ROW], t)[1].html;
    expect(html).toContain("<title>Стены в санузле под плитку: как сделать по нормам — База знаний Ровно</title>");
    expect(html).toContain('<link rel="canonical" href="https://rovno.ai/baza/resheniya/steny-v-sanuzle-pod-plitku/" />');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<meta name="description" content="Как подготовить стены ванной или душевой под облицовку плиткой. По документам: СП 163.1325800, СП 71.13330" />');
    // Crumbs and markup match.
    expect(html).toContain('<a href="/baza/resheniya/">Решения</a>');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"citation":[{"@type":"CreativeWork","name":"СП 163.1325800","url":"https://rovno.ai/baza/sp-163-1325800/"}');
    // Every case is in the page: the default one visible, the others hidden.
    expect(html).toContain('<li data-when="base:gklv zone:wet">Поверхности листов ГКЛВ покрыть гидроизолирующим составом.');
    expect(html).toContain('<li data-when="base:mineral" hidden>Основание из бетона огрунтовать перед облицовкой.');
    expect(html).toContain('<tr data-when="base:gklv"><td>Заход полосы гидроизоляции на листы (рекомендация)</td>');
    expect(html).toContain('<button type="button" data-option="mineral" aria-pressed="false">Бетон, кирпич, штукатурка</button>');
    // Sections, quotes and clause links, the check line and the guest CTA.
    for (const text of ["Шаги", "Числа", "Что проверить при приёмке", "Где источники расходятся"]) expect(html).toContain(`<h2>${text}</h2>`);
    expect(html).toContain("<summary>СП 163, п. 6.4.2.8</summary>");
    expect(html).toContain("<blockquote>«…должны быть покрыты гидроизолирующим составом…»</blockquote>");
    expect(html).toContain('<a href="/baza/sp-163-1325800/#p-6-4-2-8">Открыть пункт в документе</a>');
    expect(html).toContain("Проверено 25.10.2026");
    expect(html).toContain("Сверено с источниками, 25.10.2026");
    expect(html).toContain('href="/auth/signup">Спросить Шурика</a>');
    expect(html).toContain('<script type="application/json" id="__KB_SOLUTION_DATA__">');
  });

  it("adds the folder and every card to the sitemap, the index and llms.txt", () => {
    expect(kbSolutionSitemapUrls([SOLUTION_ROW, second], "2026-10-28")).toEqual([
      "  <url><loc>https://rovno.ai/baza/resheniya/</loc><lastmod>2026-10-28</lastmod></url>",
      "  <url><loc>https://rovno.ai/baza/resheniya/steny-v-sanuzle-pod-plitku/</loc><lastmod>2026-10-25</lastmod></url>",
      "  <url><loc>https://rovno.ai/baza/resheniya/pol-v-sanuzle-pod-plitku/</loc><lastmod>2026-10-26</lastmod></url>",
    ]);
    const index = kbIndexPageHtml(TEMPLATE, { sp: 1 }, t, [], 2);
    expect(index.indexOf('href="/baza/resheniya/"')).toBeLessThan(index.indexOf('href="/baza/razdel/sp/"'));
    expect(index).toContain("2 решения");
    const llms = kbLlmsSection({ sp: 1 }, t, [], [normalizeKbSolution(SOLUTION_ROW)]);
    expect(llms).toContain("- [Стены в санузле под плитку](https://rovno.ai/baza/resheniya/steny-v-sanuzle-pod-plitku/)");
    // A document can never take the folder's address.
    expect(KB_RESERVED_SLUGS.has("resheniya")).toBe(true);
  });

  it("dates the sitemap on the Moscow calendar", () => {
    const late = solutionRow({ updated_at: "2026-10-27T22:31:00Z" });
    expect(kbSolutionSitemapUrls([late], "2026-10-28")[1]).toContain("<lastmod>2026-10-28</lastmod>");
    const html = kbSolutionPages(TEMPLATE, [solutionRow({ reviewed_at: "2026-10-27T22:31:00Z" })], t)[1].html;
    expect(html).toContain("Проверено 28.10.2026");
    expect(html).toContain("Сверено с источниками, 28.10.2026");
  });

  it("lists the pages, the sitemap and llms.txt from the same usable cards", () => {
    const untitled = solutionRow({ slug: "bez-nazvaniya", title: "  " });
    expect(kbSolutionPages(TEMPLATE, [SOLUTION_ROW, untitled], t)).toHaveLength(2);
    expect(kbSolutionSitemapUrls([SOLUTION_ROW, untitled], "2026-10-28")).toHaveLength(2);
    expect(kbSolutionSitemapUrls([untitled], "2026-10-28")).toEqual([]);
    const bracketed = normalizeKbSolution(solutionRow({ title: "Швы [и стыки] \\ примыкания" }));
    expect(kbLlmsSection({}, t, [], [bracketed])).toContain(
      "- [Швы \\[и стыки\\] \\\\ примыкания](https://rovno.ai/baza/resheniya/steny-v-sanuzle-pod-plitku/)",
    );
  });

  it("puts the quote of every fact behind a chip into its <details>", () => {
    const html = kbSolutionPages(TEMPLATE, [SEAMS_ROW], t)[1].html;
    expect(html.match(/<details class="rv-kb-cite">/g)).toHaveLength(1);
    expect(html).toContain(
      "<summary>СП 71, п. 7.4.13</summary><p>СП 71.13330 · п. 7.4.13</p>" +
        "<blockquote>«…швы должны быть заполнены специальными шовными материалами…»</blockquote>" +
        "<blockquote>«…допускается сокращение технологической паузы, если это предусмотрено ПР или требованием производителя материала клеевой прослойки…»</blockquote>",
    );
  });

  it("escapes hostile card content: no injected tags or attributes", () => {
    const evil = '</script><img src=x onerror=x>">';
    const body = SOLUTION_ROW.body as Record<string, unknown>;
    const facts = SOLUTION_ROW.kb_solution_facts as Array<Record<string, unknown>>;
    const build = (value: string) =>
      solutionRow({
        title: value,
        body: { ...body, summary: value, steps: [{ text: value, facts: [1] }] },
        kb_solution_facts: facts.map((f) => (f.position === 1 ? { ...f, quote: value, clause_anchor: value } : f)),
      });
    const row = build(evil);
    const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
    const clean = kbSolutionPages(TEMPLATE, [build("обычный текст")], t).map((p) => parse(p.html));
    kbSolutionPages(TEMPLATE, [row], t).forEach((page, i) => {
      const doc = parse(page.html);
      // The same tags as the same card with plain text (the site chrome has its own logo), and no handler anywhere.
      expect(doc.querySelectorAll("*").length).toBe(clean[i].querySelectorAll("*").length);
      expect([...doc.querySelectorAll("img")].map((el) => el.getAttribute("src"))).toEqual(
        [...clean[i].querySelectorAll("img")].map((el) => el.getAttribute("src")),
      );
      expect([...doc.querySelectorAll("*")].some((el) => [...el.attributes].some((a) => a.name.startsWith("on")))).toBe(false);
      const scripts = [...doc.querySelectorAll("script")].map((el) => `${el.getAttribute("type")}#${el.id}`);
      expect(scripts).toEqual(
        page.path === "/baza/resheniya/"
          ? ["application/ld+json#rv-jsonld"]
          : ["application/ld+json#rv-jsonld", "application/json#__KB_SOLUTION_DATA__"],
      );
      expect(page.html).not.toContain("</script><img");
    });
    const card = new DOMParser().parseFromString(kbSolutionPages(TEMPLATE, [row], t)[1].html, "text/html");
    expect(card.querySelector("h1")?.textContent).toBe(evil);
    expect(card.querySelector(".rv-kb-cite blockquote")?.textContent).toBe(`«…${evil}…»`);
    const data = JSON.parse(card.getElementById("__KB_SOLUTION_DATA__")?.textContent ?? "null");
    expect(data.title).toBe(evil);
  });
});
