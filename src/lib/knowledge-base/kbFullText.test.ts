import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { createTranslator } from "./kbPrerenderConfig.mjs";
import { normalizeKbRow } from "./kbConfig.mjs";
import { kbFullTextHtml } from "./kbPrerenderConfig.mjs";
import { kbFirstText } from "./kbSeo.mjs";
import {
  amendmentList,
  kbAnchorFromHash,
  kbArticleAnchor,
  kbClauseUrl,
  kbEditionNote,
  kbIsLawAnchor,
  kbLawClauseLabel,
  kbEditionLine,
  kbFullTextReadable,
  kbHighlight,
  kbPendingAmendmentsView,
  kbSearchMatches,
  kbSectionAnchor,
  kbTextLabel,
  kbToc,
  normalizeKbClause,
} from "./kbFullText.mjs";

const t = createTranslator(ru as Record<string, string>);

const row = (over: Record<string, unknown> = {}) =>
  normalizeKbRow({
    doc_id: "SP-012",
    slug: "sp-71-13330",
    designation: "СП 71.13330",
    title: "Изоляционные и отделочные покрытия",
    category: "Свод правил",
    folder: "sp",
    display_mode: "full_text",
    full_text_available: true,
    text_label: "checking",
    text_base_year: 2017,
    edition_date: "2017-08-28",
    text_checked_at: "2026-10-22",
    pending_amendments: [
      { no: 2, url: "https://minstroyrf.gov.ru/docs/140650/" },
      { no: 1, url: "https://minstroyrf.gov.ru/docs/17946/" },
      { no: 3, url: "https://minstroyrf.gov.ru/docs/419098/" },
      { no: 4, url: "https://minstroyrf.gov.ru/docs/435883/" },
    ],
    ...over,
  });

const clauses = [
  { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1, amendments: [] },
  { anchor: "p-4-7", number: "4.7", level: 2, heading: null, body: "Учет работ ведут в журнале. Журнал общий.", position: 2, amendments: [4] },
  { anchor: "p-7", number: "7", level: 1, heading: "Отделочные работы", body: "", position: 3, amendments: [] },
  { anchor: "p-7-1", number: "7.1", level: 2, heading: "Общие требования", body: "", position: 4, amendments: [] },
  { anchor: "p-7-1-1", number: "7.1.1", level: 3, heading: null, body: "Штукатурку наносят по ЖУРНАЛУ работ.", position: 5, amendments: [] },
  { anchor: "p-pril-a", number: "Приложение А", level: 1, heading: "Приложение А Методика", body: "Текст.", position: 6, amendments: [] },
].map(normalizeKbClause);

describe("kbFullText", () => {
  it("lists amendment numbers as ranges from three in a row", () => {
    expect(amendmentList([4, 1, 2, 3])).toBe("1-4");
    expect(amendmentList([1, 2, 4, 5])).toBe("1, 2, 4, 5");
    expect(amendmentList([1, 2])).toBe("1, 2");
    expect(amendmentList([3])).toBe("3");
  });

  it("labels a text in check yellow and names the year and what is missing (label v2, frame 1)", () => {
    const doc = row();
    expect(kbTextLabel(doc, t)).toEqual({ kind: "checking", text: "Проверяется" });
    expect(kbEditionLine(doc, t)).toBe("Текст 2017 года, без изменений № 1-4");
    expect(kbEditionLine(doc, t, { short: true })).toBe("Текст 2017 года");
    expect(doc.pendingAmendments.map((a) => a.no)).toEqual([1, 2, 3, 4]);
  });

  it("labels a verified text green with the date inside and reads the edition (label v2, frame 0)", () => {
    const doc = row({ text_label: "verified", pending_amendments: [], applied_amendments: [1, 2, 3, 4], edition_date: "2025-10-03" });
    expect(kbTextLabel(doc, t)).toEqual({ kind: "verified", text: "Проверено 22.10.2026" });
    expect(kbEditionLine(doc, t)).toBe("Редакция от 03.10.2025, с изменениями № 1-4");
    const plain = row({ text_label: "verified", pending_amendments: [], applied_amendments: [] });
    expect(kbEditionLine(plain, t)).toBe("Редакция от 28.08.2017");
  });

  it("labels a replaced document red", () => {
    expect(kbTextLabel(row({ doc_status: "replaced" }), t)).toEqual({ kind: "inactive", text: "Не действует" });
  });

  it("has no label and no edition line without a full text", () => {
    const card = row({ full_text_available: false });
    expect(kbTextLabel(card, t)).toBeNull();
    expect(kbEditionLine(card, t)).toBeNull();
  });

  it("splits pending amendments into linked and not found (label v2, frame 2, СП 30)", () => {
    const doc = row({
      pending_amendments: [
        { no: 1, url: null }, { no: 2, url: null }, { no: 3, url: "https://minstroyrf.gov.ru/docs/361158/" },
        { no: 4, url: null }, { no: 5, url: "javascript:alert(1)" },
      ],
    });
    const view = kbPendingAmendmentsView(doc);
    expect(view.linked).toEqual([{ no: 3, url: "https://minstroyrf.gov.ru/docs/361158/" }]);
    expect(view.missingList).toBe("1, 2, 4, 5");
  });

  it("hides the SP full text when the switch is off, and only for SP (R-10)", () => {
    const sp = row();
    expect(kbFullTextReadable(sp, true)).toBe(true);
    expect(kbFullTextReadable(sp, undefined)).toBe(true);
    expect(kbFullTextReadable(sp, false)).toBe(false);
    expect(kbFullTextReadable(row({ folder: "laws" }), false)).toBe(true);
    expect(kbFullTextReadable(row({ full_text_available: false }), true)).toBe(false);
  });

  it("builds the contents from sections and headed subsections, appendices apart", () => {
    const toc = kbToc(clauses);
    expect(toc.main.map((e) => e.label)).toEqual(["4 Общие положения", "7 Отделочные работы", "7.1 Общие требования"]);
    expect(toc.back.map((e) => e.anchor)).toEqual(["p-pril-a"]);
    expect(kbSectionAnchor(clauses, "p-7-1-1")).toBe("p-7");
  });

  it("finds every occurrence ignoring case and ё, nothing for one letter", () => {
    const m = kbSearchMatches(clauses, "журнал");
    expect(m.map((x) => x.anchor)).toEqual(["p-4-7", "p-4-7", "p-7-1-1"]);
    expect(kbSearchMatches(clauses, "ж")).toEqual([]);
    expect(kbSearchMatches([normalizeKbClause({ anchor: "p-1", body: "Ёмкость бака" })], "емкость")).toHaveLength(1);
  });

  it("highlights the matches of a text and marks the current one", () => {
    const pieces = kbHighlight("один журнал два журнал", [{ start: 5, end: 11, index: 0 }, { start: 16, end: 22, index: 1 }], 1);
    expect(pieces.map((p) => [p.text, p.hit, p.current])).toEqual([
      ["один ", false, false], ["журнал", true, false], [" два ", false, false], ["журнал", true, true],
    ]);
  });

  it("builds the clause link and reads only clause anchors from a hash", () => {
    expect(kbClauseUrl("https://rovno.ai/", "sp-71-13330", "p-7-2")).toBe("https://rovno.ai/baza/sp-71-13330/#p-7-2");
    expect(kbAnchorFromHash("#p-7-2")).toBe("p-7-2");
    expect(kbAnchorFromHash("#p-4-5b")).toBe("p-4-5b");
    expect(kbAnchorFromHash("#top")).toBeNull();
    expect(kbAnchorFromHash("#p-1\"><img")).toBeNull();
  });

  it("ignores a malformed hash and reads appendix anchors with Cyrillic letters", () => {
    expect(kbAnchorFromHash("#%")).toBeNull();
    expect(kbAnchorFromHash("#p-pril-%D1%80-1")).toBe("p-pril-р-1");
  });
});

describe("a law (docs-library slice 9)", () => {
  const law = [
    { anchor: "gl-6", number: null, level: 1, heading: "Глава 6. Архитектурно-строительное проектирование", body: "", position: 1, amendments: [] },
    { anchor: "st-51", number: null, level: 2, heading: "Статья 51. Разрешение на строительство", body: "(Наименование в редакции Федерального закона от 18.07.2011 № 224-ФЗ)", position: 2, amendments: [] },
    { anchor: "st-51-ch-1", number: "1", level: 3, heading: null, body: "Разрешение на строительство представляет собой документ.\n(В редакции Федерального закона от 03.08.2018 № 342-ФЗ)", position: 3, amendments: [] },
    { anchor: "st-51-ch-1-1", number: "1¹", level: 3, heading: null, body: "В случаях, предусмотренных частью 6 статьи 36 (за исключением случаев)", position: 4, amendments: [] },
    { anchor: "gl-6-1", number: null, level: 1, heading: "Глава 6.1. Строительство в особых условиях", body: "", position: 5, amendments: [] },
    { anchor: "st-51s1", number: null, level: 2, heading: "Статья 51¹. Уведомление", body: "Текст статьи.", position: 6, amendments: [] },
  ].map(normalizeKbClause);

  it("contents: chapters at level 1, their articles at level 2, parts not listed", () => {
    expect(kbToc(law)).toEqual({
      main: [
        { anchor: "gl-6", label: "Глава 6. Архитектурно-строительное проектирование", level: 1 },
        { anchor: "st-51", label: "Статья 51. Разрешение на строительство", level: 2 },
        { anchor: "gl-6-1", label: "Глава 6.1. Строительство в особых условиях", level: 1 },
        { anchor: "st-51s1", label: "Статья 51¹. Уведомление", level: 2 },
      ],
      back: [],
    });
  });

  it("the chapter and the article a part belongs to", () => {
    expect(kbSectionAnchor(law, "st-51-ch-1-1")).toBe("gl-6");
    expect(kbArticleAnchor(law, "st-51-ch-1-1")).toBe("st-51");
    expect(kbArticleAnchor(law, "gl-6-1")).toBeNull();
    expect(kbArticleAnchor(law, "st-51s1")).toBe("st-51s1");
  });

  it("the edition note is the last whole line naming an act by date, shown without brackets", () => {
    expect(kbEditionNote(law[2])).toEqual({
      text: "Разрешение на строительство представляет собой документ.",
      note: "В редакции Федерального закона от 03.08.2018 № 342-ФЗ",
      noteStart: 58,
    });
    expect(law[2].body.slice(58, 58 + 11)).toBe("В редакции ");
    expect(kbEditionNote(law[1])).toEqual({ text: "", note: "Наименование в редакции Федерального закона от 18.07.2011 № 224-ФЗ", noteStart: 1 });
    expect(kbEditionNote(law[3])).toEqual({ text: law[3].body, note: null, noteStart: -1 });
    const crlf = normalizeKbClause({ anchor: "st-1-ch-1", number: "1", level: 3, body: "Текст.\r\n(в ред. Федерального закона от 01.01.2020 № 1-ФЗ)" });
    const split = kbEditionNote(crlf);
    expect(split.text).toBe("Текст.");
    expect(crlf.body.slice(split.noteStart, split.noteStart + 6)).toBe("в ред.");
    // A building code keeps its own bracketed lines as text.
    const sp = normalizeKbClause({ anchor: "p-5-1", number: "5.1", level: 2, body: "Текст.\n(В редакции Изменения от 01.02.2020 № 1)" });
    expect(kbEditionNote(sp)).toEqual({ text: sp.body, note: null, noteStart: -1 });
  });

  it("links to a law part open from the address hash", () => {
    expect(kbAnchorFromHash("#st-51-ch-7")).toBe("st-51-ch-7");
    expect(kbAnchorFromHash("#st-51-ch-1-1")).toBe("st-51-ch-1-1");
    expect(kbAnchorFromHash("#gl-6-1")).toBe("gl-6-1");
    expect(kbAnchorFromHash("#st-51s1")).toBe("st-51s1");
    expect(kbAnchorFromHash("#xx-51")).toBeNull();
    expect(kbIsLawAnchor("st-51")).toBe(true);
    expect(kbIsLawAnchor("p-5-1")).toBe(false);
    expect(kbIsLawAnchor("cz-2")).toBe(true);
    expect(kbIsLawAnchor("rz-iiis1")).toBe(true);
    expect(kbAnchorFromHash("#cz-2")).toBe("cz-2");
    expect(kbToc([
      { anchor: "cz-2", number: null, level: 1, heading: "ЧАСТЬ ВТОРАЯ", body: "", position: 1 },
      { anchor: "rz-ii", number: null, level: 1, heading: "РАЗДЕЛ II. ПРАВО СОБСТВЕННОСТИ", body: "", position: 2 },
      { anchor: "st-30", number: null, level: 2, heading: "Статья 30. Права", body: "", position: 3 },
    ].map(normalizeKbClause))).toEqual({
      main: [
        { anchor: "cz-2", label: "ЧАСТЬ ВТОРАЯ", level: 1 },
        { anchor: "rz-ii", label: "РАЗДЕЛ II. ПРАВО СОБСТВЕННОСТИ", level: 1 },
        { anchor: "st-30", label: "Статья 30. Права", level: 2 },
      ],
      back: [],
    });
  });

  it("the guest page: chapter h2, article h3, the note in its own line; the description skips notes", () => {
    const doc = normalizeKbRow({ doc_id: "LAW-001", slug: "grk-rf", folder: "laws", full_text_available: true, text_label: "verified", edition_date: "2026-08-04", text_checked_at: "2026-11-10", text_source_url: "http://pravo.gov.ru/" });
    const html = kbFullTextHtml(doc, law, t);
    expect(html).toContain('<h2 id="gl-6">Глава 6. Архитектурно-строительное проектирование</h2>');
    expect(html).toContain('<h3 id="st-51">Статья 51. Разрешение на строительство</h3><p class="rv-kb-edition">Наименование в редакции Федерального закона от 18.07.2011 № 224-ФЗ</p>');
    expect(html).toContain('<p id="st-51-ch-1"><strong>1 </strong>Разрешение на строительство представляет собой документ.</p><p class="rv-kb-edition">В редакции Федерального закона от 03.08.2018 № 342-ФЗ</p>');
    expect(kbFirstText([law[1], law[2]])).toBe("Разрешение на строительство представляет собой документ.");
    // Items of a part keep a line each in the guest snapshot too.
    const items = normalizeKbClause({ anchor: "st-51-ch-17", number: "17", level: 3, heading: null, body: "Не требуется в случае:\n1) гаража;\n2) киоска.", position: 7, amendments: [] });
    expect(kbFullTextHtml(doc, [items], t)).toContain('<p id="st-51-ch-17"><strong>17 </strong>Не требуется в случае:<br>1) гаража;<br>2) киоска.</p>');
  });

  it("the source label of a law part reads «ст. N ч. M»", () => {
    expect(kbLawClauseLabel("st-51-ch-17")).toBe("ст. 51 ч. 17");
    expect(kbLawClauseLabel("st-51-ch-1-1")).toBe("ст. 51 ч. 1¹");
    expect(kbLawClauseLabel("st-51s1-ch-2")).toBe("ст. 51¹ ч. 2");
    expect(kbLawClauseLabel("st-51-1")).toBe("ст. 51.1");
    expect(kbLawClauseLabel("st-55s5s1-ch-1")).toBe("ст. 55⁵⁻¹ ч. 1");
    expect(kbLawClauseLabel("st-51-ch-7-1-1")).toBe("ст. 51 ч. 7¹⁻¹");
    expect(kbLawClauseLabel("p-7-4-17")).toBeNull();
    expect(kbLawClauseLabel(null)).toBeNull();
  });
});
