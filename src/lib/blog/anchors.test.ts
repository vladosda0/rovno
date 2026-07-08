import { describe, expect, it } from "vitest";
import { withHeadingAnchors } from "./anchors";
import { annotateArticleHtml, MIN_TOC_ENTRIES } from "./anchorsConfig.mjs";

const H2 = (text: string) => `<h2>${text}</h2><p>текст</p>`;
/** A body long enough to earn a TOC. */
const threeSections = H2("Первый") + H2("Второй") + H2("Третий");

describe("withHeadingAnchors", () => {
  it("transliterates heading text into a stable id", () => {
    // Same table slugifyTitle uses for post slugs (ё → e), so a heading anchor
    // and a post slug never disagree about the same Russian word.
    const { html, toc } = withHeadingAnchors(H2("Всё начинается со сметы"));
    expect(html).toContain('<h2 id="vse-nachinaetsya-so-smety">');
    expect(toc).toEqual([
      { id: "vse-nachinaetsya-so-smety", text: "Всё начинается со сметы", level: 2 },
    ]);
  });

  it("anchors h3 as well as h2", () => {
    const { toc } = withHeadingAnchors("<h2>Раздел</h2><h3>Подраздел</h3>");
    expect(toc.map((e) => e.level)).toEqual([2, 3]);
    expect(toc[1].id).toBe("podrazdel");
  });

  it("de-duplicates ids so a repeated heading does not shadow the first", () => {
    const { html, toc } = withHeadingAnchors(H2("Итоги") + H2("Итоги") + H2("Итоги"));
    expect(toc.map((e) => e.id)).toEqual(["itogi", "itogi-2", "itogi-3"]);
    expect(html).toContain('id="itogi-2"');
    expect(html).toContain('id="itogi-3"');
  });

  it("falls back to a placeholder id when a heading transliterates to nothing", () => {
    const { toc } = withHeadingAnchors(H2("!!!") + H2("???"));
    expect(toc.map((e) => e.id)).toEqual(["razdel", "razdel-2"]);
  });

  it("skips headings with no text", () => {
    const { toc } = withHeadingAnchors("<h2></h2><h2>  </h2><h2>Реальный</h2>");
    expect(toc).toHaveLength(1);
  });

  it("prepends a TOC once the article has enough sections", () => {
    const { html } = withHeadingAnchors(threeSections);
    expect(html).toContain('<nav class="rv-toc"');
    expect(html).toContain('<a href="#pervyy">Первый</a>');
    expect(html.indexOf("rv-toc")).toBeLessThan(html.indexOf("<h2"));
  });

  it("omits the TOC for a short article", () => {
    const { html } = withHeadingAnchors(H2("Один") + H2("Два"));
    expect(html).not.toContain("rv-toc");
    expect(MIN_TOC_ENTRIES).toBe(3);
  });

  it("lists only h2 sections in the TOC but still anchors h3", () => {
    const { html } = withHeadingAnchors(threeSections + "<h3>Глубже</h3>");
    expect(html).toContain('id="glubzhe"');
    expect(html).not.toContain('href="#glubzhe"');
  });

  it("escapes heading text on the way into the TOC", () => {
    // The body is sanitized before this pass, but the TOC re-emits heading text
    // as new markup — it has to escape it itself.
    const { html } = withHeadingAnchors(
      "<h2>a &amp; b</h2><h2>&lt;script&gt;</h2><h2>\"кавычки\"</h2>",
    );
    expect(html).toContain("<li><a href=\"#a-b\">a &amp; b</a></li>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("overwrites an id the author somehow smuggled in", () => {
    const { html } = withHeadingAnchors('<h2 id="attacker">Раздел</h2>');
    expect(html).toContain('id="razdel"');
    expect(html).not.toContain('id="attacker"');
  });

  it("returns empty for empty input", () => {
    expect(withHeadingAnchors("")).toEqual({ html: "", toc: [] });
  });

  it("leaves non-heading content untouched", () => {
    const body = '<p>Привет</p><figure data-rv-figure=""><img src="https://x.test/a.jpg" alt="А"><figcaption>Подпись</figcaption></figure>';
    const { html } = withHeadingAnchors(body);
    expect(html).toBe(body);
  });
});

describe("annotateArticleHtml", () => {
  it("does not mutate the caller's document", () => {
    // The parse callback must hand back a detached document; if it ever returned
    // the live one, this pass would stamp ids onto the real page.
    const detached = document.implementation.createHTMLDocument("");
    detached.body.innerHTML = "<h2>Раздел</h2>";
    annotateArticleHtml("<h2>Другой</h2>", () => detached);
    expect(document.body.querySelector("h2")).toBeNull();
  });
});
