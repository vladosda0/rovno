// @vitest-environment jsdom
//
// Dzen feed (dist/blog/dzen.xml): only the tags Dzen's RSS help lists, tables
// as "шапка: значение" lists, utm_* cut from every address, an enclosure only
// for a cover type Dzen reads. The rules and their source are in the header of
// dzenFeedConfig.mjs.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DZEN_CATEGORIES,
  DZEN_MAX_ITEMS,
  dzenArticleHtml,
  dzenFeedXml,
  dzenImageType,
  dzenItemXml,
  stripUtm,
} from "./dzenFeedConfig.mjs";
import { sanitizeArticleHtml } from "./sanitize";

const ORIGIN = "https://rovno.ai";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");
const toDzen = (html: string) => dzenArticleHtml(html, parse, ORIGIN);

/** Every tag name in a fragment. */
function tagsIn(html: string): Set<string> {
  const doc = parse(html);
  return new Set(Array.from(doc.body.querySelectorAll("*")).map((el) => el.tagName.toLowerCase()));
}

const DZEN_ALLOWED = new Set([
  "p", "a", "b", "i", "u", "s", "h1", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "img", "figure", "figcaption",
]);

describe("stripUtm", () => {
  it("drops utm_* and keeps every other parameter", () => {
    expect(stripUtm("https://rovno.ai/?utm_source=tg&utm_campaign=blog&x=1&UTM_Term=a", ORIGIN)).toBe("https://rovno.ai/?x=1");
  });

  it("drops the question mark when nothing is left", () => {
    expect(stripUtm("https://rovno.ai/blog/a/?utm_source=tg", ORIGIN)).toBe("https://rovno.ai/blog/a/");
  });

  it("resolves a relative address against the site", () => {
    expect(stripUtm("/blog/a/?utm_medium=x", ORIGIN)).toBe("https://rovno.ai/blog/a/");
  });

  it("refuses non-http(s) and empty values", () => {
    expect(stripUtm("javascript:alert(1)", ORIGIN)).toBeNull();
    expect(stripUtm("mailto:a@b.c", ORIGIN)).toBeNull();
    expect(stripUtm("", ORIGIN)).toBeNull();
    expect(stripUtm(null, ORIGIN)).toBeNull();
  });
});

describe("dzenImageType", () => {
  it.each([
    ["https://x.test/a.jpg", "image/jpeg"],
    ["https://x.test/a.JPEG", "image/jpeg"],
    ["https://x.test/a.png?v=2", "image/png"],
    ["https://x.test/a.gif", "image/gif"],
    ["https://x.test/a.webp", null],
    ["https://x.test/a", null],
    ["not a url", null],
  ])("%s → %s", (src, type) => {
    expect(dzenImageType(src)).toBe(type);
  });
});

describe("dzenArticleHtml", () => {
  it("turns a table into one list item per data row, «шапка: значение»", () => {
    const html =
      '<table style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col><col></colgroup><tbody>' +
      '<tr><th colspan="1" rowspan="1"><p>Работа</p></th><th><p>Ед.</p></th><th><p>Цена, ₽ (Москва, октябрь 2026)</p></th></tr>' +
      "<tr><td><p>Штукатурка стен по маякам</p></td><td><p>м²</p></td><td><p>650-800</p></td></tr>" +
      "<tr><td><p><em>Шпаклёвка</em> под покраску</p></td><td><p>м²</p></td><td><p>350-450</p></td></tr>" +
      "</tbody></table>";

    expect(toDzen(html)).toBe(
      "<ul>" +
        "<li>Работа: Штукатурка стен по маякам; Ед.: м²; Цена, ₽ (Москва, октябрь 2026): 650-800</li>" +
        "<li>Работа: Шпаклёвка под покраску; Ед.: м²; Цена, ₽ (Москва, октябрь 2026): 350-450</li>" +
        "</ul>",
    );
  });

  it("lists rows without labels when the table has no header row", () => {
    expect(toDzen("<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>")).toBe("<ul><li>a; b</li></ul>");
  });

  it("escapes cell text", () => {
    expect(toDzen("<table><tbody><tr><th>A&amp;B</th></tr><tr><td>&lt;1&gt;</td></tr></tbody></table>")).toBe(
      "<ul><li>A&amp;B: &lt;1&gt;</li></ul>",
    );
  });

  it("maps marks to Dzen's tags and unwraps the rest", () => {
    expect(toDzen("<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code></p>")).toBe(
      "<p><b>b</b> <i>i</i> <u>u</u> <s>s</s> c</p>",
    );
  });

  it("cuts utm_* from links and drops target/rel", () => {
    expect(
      toDzen('<p><a target="_blank" rel="noopener noreferrer" href="https://minstroyrf.gov.ru/docs/1/?utm_source=x&amp;id=2">М</a></p>'),
    ).toBe('<p><a href="https://minstroyrf.gov.ru/docs/1/?id=2">М</a></p>');
  });

  it("makes internal links absolute and unwraps in-page anchors", () => {
    expect(toDzen('<p><a href="/blog/x/?utm_campaign=blog">x</a> <a href="#razdel">y</a></p>')).toBe(
      '<p><a href="https://rovno.ai/blog/x/">x</a> y</p>',
    );
  });

  it("keeps list items as plain text (Dzen allows nothing else inside li)", () => {
    expect(toDzen("<ul><li><p><strong>Штукатурка</strong> по <a href='https://x.test'>маякам</a></p></li></ul><ol><li><p>1</p></li></ol>")).toBe(
      "<ul><li>Штукатурка по маякам</li></ul><ol><li>1</li></ol>",
    );
  });

  it("keeps figures with a caption, drops an empty caption and width/loading attributes", () => {
    const html =
      '<figure data-rv-figure=""><img src="https://x.test/a.png?utm_source=tg" loading="lazy" decoding="async" alt="A" width="1200" height="630"><figcaption>Смета на <strong>двушку</strong></figcaption></figure>' +
      '<figure data-rv-figure=""><img src="https://x.test/b.png" alt="B"><figcaption></figcaption></figure>';

    expect(toDzen(html)).toBe(
      '<figure><img src="https://x.test/a.png" alt="A"><figcaption>Смета на <b>двушку</b></figcaption></figure>' +
        '<figure><img src="https://x.test/b.png" alt="B"></figure>',
    );
  });

  it("flattens the FAQ into headings and paragraphs, and drops the divider", () => {
    const html =
      '<hr><div data-rv-faq-item=""><h3 data-rv-faq-q="">Вопрос?</h3><div data-rv-faq-a=""><p>Ответ.</p><p>Ещё.</p></div></div>';

    expect(toDzen(html)).toBe("<h3>Вопрос?</h3><p>Ответ.</p><p>Ещё.</p>");
  });

  it("turns a video embed into a plain link Dzen makes a player of", () => {
    expect(toDzen('<div data-youtube-video=""><iframe src="https://www.youtube-nocookie.com/embed/abc_1-2"></iframe></div>')).toBe(
      '<p><a href="https://www.youtube.com/watch?v=abc_1-2">https://www.youtube.com/watch?v=abc_1-2</a></p>',
    );
  });

  it("keeps quotes, headings and code blocks as text", () => {
    expect(toDzen("<h2>H</h2><blockquote><p>q</p></blockquote><pre><code>a &lt; b</code></pre>")).toBe(
      "<h2>H</h2><blockquote><p>q</p></blockquote><p>a &lt; b</p>",
    );
  });

  it("emits only tags from Dzen's list for the full door fixture", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, "__fixtures__/shurik-door-v1.json"), "utf8"),
    ) as { content_html: string };

    const out = toDzen(sanitizeArticleHtml(fixture.content_html));

    for (const tag of tagsIn(out)) expect(DZEN_ALLOWED, tag).toContain(tag);
    expect(out).toContain("<li>Работа: Штукатурка стен; Ед.: м²; Цена, ₽ (Москва, октябрь 2026): 650</li>");
    expect(out).toContain("Проверено: 16.10.2026");
    expect(out).not.toMatch(/style=|colspan|data-rv/);
  });
});

describe("dzenItemXml / dzenFeedXml", () => {
  const post = {
    slug: "smeta-na-remont",
    title: "Смета & ремонт",
    excerpt: "Коротко <о главном>.",
    cover_image_url: "https://cdn.example/blog-images/shurik/abc.png?utm_source=x",
    published_at: "2026-10-16T09:00:00Z",
  };

  it("builds an item with link, guid, RFC 822 date, categories, cover and full text", () => {
    const xml = dzenItemXml(post, "<p>Текст ]]> с концом CDATA</p>", ORIGIN);

    expect(xml).toContain("<title>Смета &amp; ремонт</title>");
    expect(xml).toContain("<link>https://rovno.ai/blog/smeta-na-remont/</link>");
    expect(xml).toContain('<guid isPermaLink="true">https://rovno.ai/blog/smeta-na-remont/</guid>');
    expect(xml).toContain("<pubDate>Fri, 16 Oct 2026 09:00:00 GMT</pubDate>");
    for (const category of DZEN_CATEGORIES) expect(xml).toContain(`<category>${category}</category>`);
    expect(xml).toContain('<enclosure url="https://cdn.example/blog-images/shurik/abc.png" type="image/png"/>');
    expect(xml).toContain("<description>Коротко &lt;о главном&gt;.</description>");
    expect(xml).toContain("<content:encoded><![CDATA[<p>Текст ]]]]><![CDATA[> с концом CDATA</p>]]></content:encoded>");
  });

  it("omits the enclosure without a cover or with a cover Dzen cannot read", () => {
    expect(dzenItemXml({ ...post, cover_image_url: null }, "<p>x</p>", ORIGIN)).not.toContain("<enclosure");
    expect(dzenItemXml({ ...post, cover_image_url: "https://x.test/a.webp" }, "<p>x</p>", ORIGIN)).not.toContain("<enclosure");
  });

  it("omits pubDate and description when absent", () => {
    const xml = dzenItemXml({ ...post, published_at: null, excerpt: null }, "<p>x</p>", ORIGIN);

    expect(xml).not.toContain("<pubDate>");
    expect(xml).not.toContain("<description>");
  });

  it("produces well-formed XML with the namespaces Dzen expects", () => {
    const xml = dzenFeedXml([post, { ...post, slug: "b" }], {
      siteOrigin: ORIGIN,
      title: "Блог Ровно",
      description: "Статьи & заметки",
      renderBody: () => "<p>x</p>",
    });

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    const rss = doc.documentElement;
    expect(rss.getAttribute("version")).toBe("2.0");
    for (const ns of ["content", "dc", "media", "atom"]) expect(rss.getAttribute(`xmlns:${ns}`), ns).toBeTruthy();
    expect(doc.getElementsByTagName("item")).toHaveLength(2);
    expect(xml).toContain('<atom:link href="https://rovno.ai/blog/dzen.xml" rel="self"');
  });

  it(`caps the feed at ${DZEN_MAX_ITEMS} items`, () => {
    const many = Array.from({ length: DZEN_MAX_ITEMS + 3 }, (_, i) => ({ ...post, slug: `p-${i}` }));
    const xml = dzenFeedXml(many, { siteOrigin: ORIGIN, title: "t", description: "d", renderBody: () => "" });

    expect(xml.match(/<item>/g)).toHaveLength(DZEN_MAX_ITEMS);
  });
});
