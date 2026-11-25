import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { createTranslator } from "./kbPrerenderConfig.mjs";
import { normalizeKbRow } from "./kbConfig.mjs";
import { kbFullTextHtml } from "./kbPrerenderConfig.mjs";
import { kbFirstText } from "./kbSeo.mjs";
import {
  amendmentList,
  kbAnchorFromHash,
  kbBodyPieces,
  KB_TABLE,
  kbCopyNotice,
  kbArticleAnchor,
  kbClauseUrl,
  kbEditionNote,
  kbIsLawAnchor,
  kbLawClauseLabel,
  kbIsLawNote,
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

  it("the guest page: the preamble without a heading, notes with their caption and «пр.», the signature muted (show 9.2в)", () => {
    const doc = normalizeKbRow({ doc_id: "LAW-019", slug: "koap-rf", folder: "laws", full_text_available: true, text_label: "verified", edition_date: "2026-08-04", text_checked_at: "2026-11-17", text_source_url: "http://pravo.gov.ru/" });
    const rows = [
      { anchor: "gl-pre", number: null, level: 1, heading: "Преамбула", body: "Настоящий Кодекс принимается.", position: 1, amendments: [] },
      { anchor: "st-2-4", number: null, level: 2, heading: "Статья 2.4. Ответственность", body: "", position: 2, amendments: [] },
      { anchor: "st-2-4-pr", number: "пр.", level: 3, heading: null, body: "Под должностным лицом.", position: 3, amendments: [] },
      { anchor: "st-9", number: null, level: 2, heading: "Статья 9. Индекс", body: "", position: 4, amendments: [] },
      { anchor: "st-9-pr-1-1", number: "пр. 1¹", level: 3, heading: null, body: "Первое с индексом.", position: 5, amendments: [] },
      { anchor: "gl-sig", number: null, level: 1, heading: null, body: "Президент Российской Федерации\nМосква, Кремль", position: 6, amendments: [] },
    ].map(normalizeKbClause);
    const html = kbFullTextHtml(doc, rows, t);
    expect(html).toContain('<p><strong>Примечания:</strong></p><p id="st-9-pr-1-1">');
    expect(html).toContain('<p id="gl-pre">Настоящий Кодекс принимается.</p>');
    expect(html).not.toContain(">Преамбула<");
    expect(html).toContain('<p><strong>Примечание.</strong></p><p id="st-2-4-pr"><strong>пр. </strong>Под должностным лицом.</p>');
    expect(html).toContain('<p id="gl-sig" class="rv-kb-edition">Президент Российской Федерации<br>Москва, Кремль</p>');
  });

  it("the source label of a law part reads «ст. N ч. M»", () => {
    expect(kbLawClauseLabel("st-51-ch-17")).toBe("ст. 51 ч. 17");
    expect(kbLawClauseLabel("st-51-ch-1-1")).toBe("ст. 51 ч. 1¹");
    expect(kbLawClauseLabel("st-51s1-ch-2")).toBe("ст. 51¹ ч. 2");
    expect(kbLawClauseLabel("st-51-1")).toBe("ст. 51.1");
    expect(kbLawClauseLabel("st-55s5s1-ch-1")).toBe("ст. 55⁵⁻¹ ч. 1");
    expect(kbLawClauseLabel("st-51-ch-7-1-1")).toBe("ст. 51 ч. 7¹⁻¹");
    // A law whose article is split into points (ЗК РФ, step 9.2в): «п.», not «ч.».
    expect(kbLawClauseLabel("st-39-1-p-1")).toBe("ст. 39.1 п. 1");
    expect(kbLawClauseLabel("st-39-1-p-3-1")).toBe("ст. 39.1 п. 3¹");
    // Show 9.2в: a note to the article (КоАП), an index inside the number, an index with a dot (НК).
    expect(kbLawClauseLabel("st-2-4-pr")).toBe("ст. 2.4 прим.");
    expect(kbLawClauseLabel("st-4-8-pr-1")).toBe("ст. 4.8 прим. 1");
    expect(kbLawClauseLabel("st-9-1-pr-2-1")).toBe("ст. 9.1 прим. 2¹");
    expect(kbLawClauseLabel("st-29s1-1-ch-2")).toBe("ст. 29¹.1 ч. 2");
    expect(kbLawClauseLabel("st-214s2d1-p-3")).toBe("ст. 214²·¹ п. 3");
    expect(kbLawClauseLabel("st-214s2d1-p-3-2d1")).toBe("ст. 214²·¹ п. 3²·¹");
    expect(kbLawClauseLabel("st-9-1-pr-2-2d1")).toBe("ст. 9.1 прим. 2²·¹");
    expect(kbIsLawNote("st-9-1-pr-2-2d1")).toBe(true);
    expect(kbLawClauseLabel("st-333s32d1")).toBe("ст. 333³²·¹");
    expect(kbLawClauseLabel("gl-pre")).toBeNull();
    // Step 9.8: a table of the law's appendix (123-ФЗ) is «табл. 12»; the appendix stamp has no label.
    expect(kbLawClauseLabel("pril-t-12")).toBe("табл. 12");
    expect(kbLawClauseLabel("pril")).toBeNull();
    expect(kbLawClauseLabel("p-pril-t")).toBeNull();
    expect(kbIsLawNote("st-9-1-pr-2-1")).toBe(true);
    expect(kbIsLawNote("st-2-4-pr")).toBe(true);
    expect(kbIsLawNote("st-2-4-ch-1")).toBe(false);
    // A law with a preamble and no chapters (256-ФЗ): the preamble is no article's section.
    const short = [{ anchor: "gl-pre", level: 1 }, { anchor: "st-1", level: 2 }, { anchor: "st-1-ch-1", level: 3 }, { anchor: "gl-sig", level: 1 }];
    expect(kbSectionAnchor(short as never, "st-1-ch-1")).toBe("st-1-ch-1");
    expect(kbSectionAnchor(short as never, "gl-sig")).toBe("gl-sig");
    // The reader draws no heading for the preamble: search does not count «Преамбула».
    expect(kbSearchMatches([{ anchor: "gl-pre", heading: "Преамбула", body: "Текст" }] as never, "преамбул")).toEqual([]);
    expect(kbSearchMatches([{ anchor: "gl-pre", heading: "Преамбула", body: "Текст" }] as never, "текст")).toHaveLength(1);
    expect(kbSectionAnchor(short as never, "gl-pre")).toBe("gl-pre");
    expect(kbLawClauseLabel("gl-37-pg-3")).toBeNull();
    expect(kbLawClauseLabel("p-7-4-17")).toBeNull();
    expect(kbLawClauseLabel(null)).toBeNull();
  });
});

describe("a document without an official text (docs-library slice 9, frame 5)", () => {
  const copy = (over: Record<string, unknown> = {}) =>
    row({
      doc_id: "NORM-0002",
      folder: "snip",
      designation: "ВСН 57-88(р)",
      text_label: "copy",
      text_base_year: null,
      pending_amendments: [],
      text_source_url: "https://www.meganorm.ru/Data2/1/4294854/4294854948.htm",
      ...over,
    });

  it("a text from a copy has no label and no edition line, and says where it came from (B)", () => {
    const doc = copy();
    expect(doc.textLabel).toBe("copy");
    expect(kbTextLabel(doc, t)).toBeNull();
    expect(kbEditionLine(doc, t)).toBeNull();
    expect(kbCopyNotice(doc, t)).toBe(
      "Официального текста в открытом доступе нет. Текст взят с копии на meganorm.ru и не сверен с официальной публикацией.",
    );
    expect(kbCopyNotice(row(), t)).toBeNull();
    expect(kbCopyNotice(copy({ full_text_available: false }), t)).toBeNull();
  });

  it("a replaced document from a copy still reads red", () => {
    expect(kbTextLabel(copy({ doc_status: "replaced" }), t)).toEqual({ kind: "inactive", text: "Не действует" });
  });

  it("an unknown label is no label", () => {
    expect(row({ text_label: "official" }).textLabel).toBeNull();
  });

  it("the static page carries the copy notice above the text", () => {
    const html = kbFullTextHtml(copy(), clauses.slice(0, 2), t);
    expect(html).toContain("Текст взят с копии на meganorm.ru");
    expect(html).not.toContain("rv-kb-label--");
  });

  it("reads the reason line of a document without text, blank is none", () => {
    expect(row({ full_text_available: false, text_unavailable_reason: " Причина. " }).textUnavailableReason).toBe("Причина.");
    expect(row({ full_text_available: false, text_unavailable_reason: "  " }).textUnavailableReason).toBeNull();
  });
});

// Slice 9, step 9.3 (show 9.2в, frame 3 approved 17.11): a SanPiN or law table comes from the
// portal as one line of cells; the reader and the guest page draw it as a table.
describe("tables in a clause body", () => {
  const table = `${KB_TABLE}[["Виды показателей","Количество проб"],[{"t":"Микробиологические","r":2},"4 <b>"],["12"]]`;
  const body = `Количество проб устанавливается с учётом таблицы 1.\nТаблица 1\n${table}\n3. После таблицы.`;

  it("splits the body into text runs and tables with their offsets", () => {
    const pieces = kbBodyPieces(body);
    expect(pieces).toEqual([
      { kind: "text", text: "Количество проб устанавливается с учётом таблицы 1.\nТаблица 1", offset: 0 },
      { kind: "table", rows: [["Виды показателей", "Количество проб"], [{ t: "Микробиологические", r: 2 }, "4 <b>"], ["12"]], offset: body.indexOf(KB_TABLE) },
      { kind: "text", text: "3. После таблицы.", offset: body.indexOf("3. После") },
    ]);
    expect(kbBodyPieces("Просто текст.")).toEqual([{ kind: "text", text: "Просто текст.", offset: 0 }]);
    // A broken table line stays text, it is not dropped.
    expect(kbBodyPieces(`${KB_TABLE}[oops`)).toEqual([{ kind: "text", text: `${KB_TABLE}[oops`, offset: 0 }]);
  });

  it("a law clause with a table: no table inside a paragraph on the guest page; a numeric cell keeps its value", () => {
    const lawTable = `${KB_TABLE}[["Класс",12,{"t":"x","c":"2","r":0}]]`;
    const html = kbFullTextHtml(
      normalizeKbRow({ doc_id: "LAW-006", slug: "123-fz", designation: "123-ФЗ", folder: "laws", full_text_available: true, text_label: "verified", edition_date: "2025-01-01" }) as never,
      [{ anchor: "st-5-ch-1", number: "1", level: 3, heading: null, body: `До\n${lawTable}\nПосле`, position: 1, amendments: [] }] as never,
      t,
    );
    expect(html).toContain('<p id="st-5-ch-1"><strong>1 </strong>До</p><div class="rv-kb-table-wrap"><table class="rv-kb-table"><tbody><tr><td>Класс</td><td>12</td><td colspan="2">x</td></tr></tbody></table></div><p>После</p>');
    expect(kbBodyPieces(lawTable)).toHaveLength(1);
  });

  it("a table in a law's signature, preamble and article heading: between paragraphs, the signature style kept", () => {
    const tb = `${KB_TABLE}[["a","b"]]`;
    const wrap = '<div class="rv-kb-table-wrap"><table class="rv-kb-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div>';
    const html = kbFullTextHtml(
      normalizeKbRow({ doc_id: "LAW-006", slug: "123-fz", designation: "123-ФЗ", folder: "laws", full_text_available: true, text_label: "verified", edition_date: "2025-01-01" }) as never,
      [
        { anchor: "gl-pre", number: null, level: 1, heading: "Преамбула", body: `${tb}\nТекст преамбулы`, position: 1, amendments: [] },
        { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Понятия", body: `${tb}\n`, position: 2, amendments: [] },
        { anchor: "gl-sig", number: null, level: 1, heading: null, body: `Президент\n${tb}\nМосква`, position: 3, amendments: [] },
      ] as never,
      t,
    );
    expect(html).toContain(`<p id="gl-pre"></p>${wrap}<p>Текст преамбулы</p>`);
    expect(html).toContain(`<h3 id="st-1">Статья 1. Понятия</h3>${wrap}<p id="gl-sig"`);
    expect(html).not.toContain("<p></p>");
    expect(html).toContain(`<p id="gl-sig" class="rv-kb-edition">Президент</p>${wrap}<p class="rv-kb-edition">Москва</p>`);
  });

  it("search does not count matches inside a table the reader cannot highlight", () => {
    const matches = kbSearchMatches([{ anchor: "p-2", number: "2", level: 2, heading: null, body, position: 1, amendments: [] }], "проб");
    expect(matches.map((m) => m.start)).toEqual([body.indexOf("проб")]);
  });

  it("the guest page renders the table with spans, escaped", () => {
    const html = kbFullTextHtml(
      normalizeKbRow({ doc_id: "SAN-001", slug: "sanpin-2-1-3684-21", designation: "СанПиН 2.1.3684-21", folder: "sanpin", full_text_available: true, text_label: "verified", edition_date: "2022-02-14" }) as never,
      [{ anchor: "p-2", number: "2", level: 2, heading: null, body, position: 1, amendments: [] }] as never,
      t,
    );
    expect(html).toContain('<td rowspan="2">Микробиологические</td><td>4 &lt;b&gt;</td>');
    expect(html).not.toContain(KB_TABLE);
    // The table sits in its scrolling frame between paragraphs, never inside one.
    expect(html).toContain('<p id="p-2"><strong>2 </strong>Количество проб устанавливается с учётом таблицы 1.\nТаблица 1</p><div class="rv-kb-table-wrap"><table class="rv-kb-table">');
    expect(html).toContain('</table></div><p>3. После таблицы.</p>');
    expect(kbFirstText([{ anchor: "p-1", number: "1", level: 2, heading: null, body: table, position: 1, amendments: [] }] as never)).toBeNull();
  });
});
