import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { createTranslator } from "./kbPrerenderConfig.mjs";
import { normalizeKbRow } from "./kbConfig.mjs";
import {
  amendmentList,
  kbAnchorFromHash,
  kbClauseUrl,
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
