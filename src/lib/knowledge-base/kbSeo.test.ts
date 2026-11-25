import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { createTranslator, kbFolderPageHtml, kbIndexPageHtml, kbPageHtml } from "./kbPrerenderConfig.mjs";
import { normalizeKbRow } from "./kbConfig.mjs";
import { normalizeKbClause } from "./kbFullText.mjs";
import {
  STAGING_ROBOTS_TXT,
  isStagingBackend,
  kbBreadcrumbTrail,
  kbDocumentDescription,
  kbDocumentJsonLd,
  kbDocumentTitle,
  kbFolderPageCount,
  kbFolderPath,
  kbLlmsSection,
} from "./kbSeo.mjs";

const t = createTranslator(ru as Record<string, string>);

const ROW = {
  doc_id: "SP-012",
  slug: "sp-71-13330",
  designation: "СП 71.13330",
  title: "Изоляционные и отделочные покрытия",
  category: "Свод правил",
  folder: "sp",
  display_mode: "full_text",
  publisher: "Минстрой России",
  country: "Россия",
  edition: "СП 71.13330.2017 (ред. от 03.10.2025)",
  last_checked_at: "2026-10-13",
  source_links: [{ url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" }],
  full_text_available: true,
  text_label: "checking",
  text_base_year: 2017,
  edition_date: "2017-08-28",
  text_checked_at: "2026-10-22",
  text_pdf_url: "https://minstroyrf.gov.ru/upload/iblock/a94/sp-71.pdf",
  pending_amendments: [{ no: 1, url: "https://minstroyrf.gov.ru/docs/17946/" }],
};

const CLAUSES = [
  { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1 },
  { anchor: "p-4-1", number: "4.1", level: 2, heading: null, body: "Изоляционные и отделочные работы следует выполнять в соответствии с проектом.", position: 2 },
  { anchor: "p-7-1", number: "7.1", level: 2, heading: "Общие требования", body: "", position: 3 },
].map(normalizeKbClause);

const TEMPLATE = `<!doctype html><html lang="ru"><head>
    <title>Ровно</title>
    <meta name="description" content="landing" />
    <meta property="og:title" content="landing" />
    <meta property="og:description" content="landing" />
    <meta property="og:type" content="website" />
    <meta name="twitter:title" content="landing" />
    <link rel="canonical" href="https://rovno.ai/" />
  </head><body><div id="root"></div></body></html>`;

function jsonLdOf(html: string) {
  const m = html.match(/<script type="application\/ld\+json" id="rv-jsonld">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}

describe("knowledge base search surface", () => {
  it("says «полный текст» in the title of a readable document only", () => {
    const doc = normalizeKbRow(ROW);
    expect(kbDocumentTitle(doc)).toBe("СП 71.13330 · Изоляционные и отделочные покрытия — полный текст | База знаний Ровно");
    expect(kbDocumentTitle(doc, { spFullText: false })).toBe("СП 71.13330 · Изоляционные и отделочные покрытия — База знаний Ровно");
  });

  it("describes a readable document by what the page gives and its edition, within 160 characters", () => {
    const d = kbDocumentDescription(normalizeKbRow(ROW), t, { firstText: "Изоляционные работы следует выполнять по проекту." });
    expect(d.startsWith("СП 71.13330 Изоляционные и отделочные покрытия: полный текст онлайн, оглавление и ссылки на пункты. Текст 2017 года")).toBe(true);
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it("marks a norm up as Legislation with its identifier, version, legal force and sections, matching the page", () => {
    const ld = kbDocumentJsonLd(normalizeKbRow(ROW), t, { clauses: CLAUSES });
    const graph = ld["@graph"] as Array<Record<string, unknown>>;
    const work = graph.find((n) => n["@type"] === "Legislation")!;
    expect(work).toMatchObject({
      name: "Изоляционные и отделочные покрытия",
      legislationIdentifier: "СП 71.13330",
      legislationType: "Свод правил",
      legislationJurisdiction: "Россия",
      legislationPassedBy: { "@type": "Organization", name: "Минстрой России" },
      legislationDateVersion: "2017-08-28",
      legislationLegalForce: "https://schema.org/InForce",
      isBasedOn: "https://minstroyrf.gov.ru/upload/iblock/a94/sp-71.pdf",
      version: "Проверяется. Текст 2017 года, без изменений № 1",
    });
    expect((work.hasPart as Array<Record<string, unknown>>).map((p) => p.url)).toEqual([
      "https://rovno.ai/baza/sp-71-13330/#p-4",
      "https://rovno.ai/baza/sp-71-13330/#p-7-1",
    ]);
    const page = graph.find((n) => n["@type"] === "WebPage")!;
    expect(page).toMatchObject({ url: "https://rovno.ai/baza/sp-71-13330/", dateModified: "2026-10-22" });
    const crumbs = graph.find((n) => n["@type"] === "BreadcrumbList") as { itemListElement: Array<{ name: string; item: string }> };
    const trail = kbBreadcrumbTrail(t, { doc: normalizeKbRow(ROW) });
    expect(crumbs.itemListElement.map((c) => c.name)).toEqual(trail.map((c) => c.name));
    expect(crumbs.itemListElement.map((c) => c.item)).toEqual([
      "https://rovno.ai", "https://rovno.ai/baza/", "https://rovno.ai/baza/razdel/sp/", "https://rovno.ai/baza/sp-71-13330/",
    ]);
  });

  it("does not claim legal force or a version for a registry card", () => {
    const ld = kbDocumentJsonLd(normalizeKbRow({ ...ROW, full_text_available: false }), t, { clauses: [] });
    const work = (ld["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "Legislation")!;
    expect(work.legislationLegalForce).toBeUndefined();
    expect(work.legislationDateVersion).toBeUndefined();
    expect(work.hasPart).toBeUndefined();
    expect(work.isBasedOn).toBe("https://minstroyrf.gov.ru/docs/14844/");
  });

  it("a text from an unofficial copy is not based on the copy and says so in its version (docs-library slice 9)", () => {
    const copy = normalizeKbRow({
      ...ROW, text_label: "copy", pending_amendments: [], text_base_year: null,
      text_source_url: "https://meganorm.ru/Data2/1/x.htm", text_pdf_url: "https://meganorm.ru/Data2/1/x.pdf",
    });
    const work = (kbDocumentJsonLd(copy, t, { clauses: CLAUSES })["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "Legislation")!;
    expect(work.isBasedOn).toBe("https://minstroyrf.gov.ru/docs/14844/");
    expect(String(work.version)).toContain("Текст взят с копии на meganorm.ru");
    const onlyCopyLink = normalizeKbRow({
      ...ROW, text_label: "copy", pending_amendments: [], text_base_year: null,
      source_links: [{ url: "https://meganorm.ru/Data1/2/2567/index.htm", kind: "copy" }],
      text_source_url: "https://meganorm.ru/Data1/2/2567/index.htm",
    });
    const work2 = (kbDocumentJsonLd(onlyCopyLink, t, { clauses: CLAUSES })["@graph"] as Array<Record<string, unknown>>).find((n) => n["@type"] === "Legislation")!;
    expect(work2.isBasedOn).toBeUndefined();
  });

  it("marks a manufacturer's document as CreativeWork, not Legislation", () => {
    const ld = kbDocumentJsonLd(normalizeKbRow({ ...ROW, folder: "manufacturers", full_text_available: false }), t);
    const types = (ld["@graph"] as Array<Record<string, unknown>>).map((n) => n["@type"]);
    expect(types).toContain("CreativeWork");
    expect(types).not.toContain("Legislation");
  });

  it("writes the document page head: one canonical, the title, the JSON-LD with id rv-jsonld", () => {
    const html = kbPageHtml(TEMPLATE, ROW, t, [], { clauses: CLAUSES.map((c) => ({ ...c })) as never });
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain("<title>СП 71.13330 · Изоляционные и отделочные покрытия — полный текст | База знаний Ровно</title>");
    expect(jsonLdOf(html)["@graph"].some((n: { "@type": string }) => n["@type"] === "Legislation")).toBe(true);
    expect(html).toContain('<a href="/baza/razdel/sp/">Своды правил</a>');
    expect(html).toContain('<a href="/baza/">База знаний</a>');
  });

  it("builds the index page with a link to every non-empty folder and CollectionPage markup", () => {
    const html = kbIndexPageHtml(TEMPLATE, { sp: 237, gost: 1, cis: 0 }, t);
    expect(html).toContain('<a href="/baza/razdel/sp/"><strong>Своды правил</strong></a>');
    expect(html).toContain("237 документов");
    expect(html).toContain("1 документ<");
    expect(html).not.toContain("/baza/razdel/cis/");
    expect(html).toContain('<link rel="canonical" href="https://rovno.ai/baza/" />');
    const ld = jsonLdOf(html);
    expect(ld["@graph"][0]["@type"]).toBe("CollectionPage");
    expect(ld["@graph"][0].mainEntity.numberOfItems).toBe(2);
  });

  it("builds a folder page with a link to every document, its label and the pager", () => {
    const rows = [ROW, { ...ROW, doc_id: "SP-1", slug: "sp-1", designation: "СП 1.13130", title: "Системы", full_text_available: false }];
    const html = kbFolderPageHtml(TEMPLATE, "sp", rows, t, { page: 2, pages: 3, total: 1200 });
    expect(html).toContain('<a href="/baza/sp-71-13330/">СП 71.13330 Изоляционные и отделочные покрытия</a>');
    expect(html).toContain('<a href="/baza/sp-1/">СП 1.13130 Системы</a>');
    expect(html).toContain("rv-kb-label--checking");
    expect(html).toContain('<link rel="canonical" href="https://rovno.ai/baza/razdel/sp/2/" />');
    expect(html).toContain('<a href="/baza/razdel/sp/3/">3</a>');
    expect(html).toContain('<span aria-current="page">2</span>');
    expect(html).toContain("<title>Своды правил, страница 2 — База знаний Ровно</title>");
  });

  it("splits a folder into pages of 500", () => {
    expect(kbFolderPageCount(237)).toBe(1);
    expect(kbFolderPageCount(4065)).toBe(9);
    expect(kbFolderPath("manufacturers", 1)).toBe("/baza/razdel/manufacturers/");
    expect(kbFolderPath("manufacturers", 9)).toBe("/baza/razdel/manufacturers/9/");
  });

  it("closes a staging build to crawlers and leaves prod open", () => {
    expect(isStagingBackend("https://aaycwobhdkrrgfxwcfxg.supabase.co")).toBe(true);
    expect(isStagingBackend("https://api.rovno.ai")).toBe(false);
    expect(isStagingBackend(undefined)).toBe(false);
    expect(STAGING_ROBOTS_TXT).toMatch(/User-agent: \*\nDisallow: \/\n/);
  });

  it("adds the base to llms.txt with folders and the documents readable in full", () => {
    const text = kbLlmsSection({ sp: 237 }, t, [normalizeKbRow(ROW)]);
    expect(text).toContain("- [Своды правил](https://rovno.ai/baza/razdel/sp/)");
    expect(text).toContain("- [СП 71.13330 Изоляционные и отделочные покрытия](https://rovno.ai/baza/sp-71-13330/)");
  });
});
