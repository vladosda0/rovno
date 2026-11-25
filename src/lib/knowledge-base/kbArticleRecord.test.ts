import { describe, expect, it } from "vitest";
import {
  kbArticleReason,
  kbCodeKey,
  parseKbArticleRef,
  pickKbCode,
  resolveKbArticleRecord,
} from "./kbArticleRecord.mjs";

const CODES = [
  { slug: "nk-rf-146-fz-ch-i-117-fz-ch-ii", designation: "НК РФ, 146-ФЗ (ч. I), 117-ФЗ (ч. II)" },
  { slug: "gk-rf-chasti-i-iv", designation: "ГК РФ, части I-IV" },
  { slug: "grk-rf-190-fz", designation: "ГрК РФ, 190-ФЗ" },
  { slug: "190-fz-ot-27-07-2010", designation: "190-ФЗ от 27.07.2010" },
  { slug: "218-fz", designation: "218-ФЗ" },
  { slug: "137-fz-ot-25-10-2001", designation: "137-ФЗ от 25.10.2001" },
  { slug: "koap-rf-195-fz", designation: "КоАП РФ, 195-ФЗ" },
  { slug: "tk-rf-197-fz", designation: "ТК РФ, 197-ФЗ" },
  { slug: "69-fz-ot-21-12-1994", designation: "69-ФЗ от 21.12.1994" },
  { slug: "69-fz-ot-31-03-1999", designation: "69-ФЗ от 31.03.1999" },
];

describe("parseKbArticleRef", () => {
  it("reads an article, a dotted article, a superscript article and a chapter", () => {
    expect(parseKbArticleRef("ст. 220 НК РФ")).toMatchObject({ unit: "st", code: "НК РФ", candidates: ["st-220"] });
    expect(parseKbArticleRef("ст. 217.1 НК РФ")?.candidates).toEqual(["st-217-1", "st-217s1"]);
    expect(parseKbArticleRef("ст. 39¹ ЗК РФ")?.candidates).toEqual(["st-39s1"]);
    expect(parseKbArticleRef("гл. 31 НК РФ")).toMatchObject({ unit: "gl", code: "НК РФ", candidates: ["gl-31"] });
    expect(parseKbArticleRef("гл. 6.1 ГрК РФ")?.candidates).toEqual(["gl-6-1", "gl-6s1"]);
  });

  it("reads a part of an article, falling back to the article", () => {
    expect(parseKbArticleRef("ч. 17 ст. 51 ГрК РФ")?.candidates).toEqual(["st-51-ch-17", "st-51"]);
  });

  it("opens a range or a list at its first article, a section by its roman number", () => {
    expect(parseKbArticleRef("ст. 702-729 ГК РФ")?.candidates).toEqual(["st-702"]);
    expect(parseKbArticleRef("ст. 39.28, 39.29 ЗК РФ")?.candidates).toEqual(["st-39-28", "st-39s28"]);
    expect(parseKbArticleRef("ст. 39.37 ЗК РФ и далее")?.code).toBe("ЗК РФ");
    expect(parseKbArticleRef("разд. X ТК РФ (ст. 209 и далее)")).toMatchObject({ code: "ТК РФ", candidates: ["rz-x", "st-209"] });
  });

  it("reads a law by its number and a law of the RF by its №", () => {
    expect(parseKbArticleRef("ст. 40 218-ФЗ")).toMatchObject({ code: "218-ФЗ", candidates: ["st-40"] });
    expect(parseKbArticleRef("ст. 3.7 137-ФЗ; 79-ФЗ от 05.04.2021")).toMatchObject({ code: "137-ФЗ" });
    expect(parseKbArticleRef("ст. 13 Закона РФ №2300-1")).toMatchObject({ code: "№2300-1", codeLabel: "Закон РФ №2300-1" });
  });

  it("is null for a whole document or a record without a code", () => {
    expect(parseKbArticleRef("218-ФЗ")).toBeNull();
    expect(parseKbArticleRef("ПУЭ гл. 1.5")).toBeNull();
    expect(parseKbArticleRef("ПП РФ №354")).toBeNull();
    expect(parseKbArticleRef("ст. 5")).toBeNull();
    expect(parseKbArticleRef(null)).toBeNull();
  });
});

describe("kbCodeKey and pickKbCode", () => {
  it("keys a code by its short name and a law by its leading number", () => {
    expect(kbCodeKey("НК РФ, 146-ФЗ (ч. I), 117-ФЗ (ч. II)")).toBe("НК РФ");
    expect(kbCodeKey("КоАП РФ, 195-ФЗ")).toBe("КоАП РФ");
    expect(kbCodeKey("214-ФЗ от 30.12.2004")).toBe("214-ФЗ");
    expect(kbCodeKey("Закон РФ №2300-1")).toBe("№2300-1");
    expect(kbCodeKey("ПП РФ №354")).toBeNull();
  });

  it("does not confuse ГрК РФ (190-ФЗ) with the heat law 190-ФЗ, and refuses an ambiguous number", () => {
    expect(pickKbCode("ГрК РФ", CODES)?.slug).toBe("grk-rf-190-fz");
    expect(pickKbCode("190-ФЗ", CODES)).toBeNull(); // ГрК РФ, 190-ФЗ and the heat law 190-ФЗ
    expect(pickKbCode("69-ФЗ", CODES)).toBeNull();
    expect(pickKbCode("ЖК РФ", CODES)).toBeNull();
  });
});

describe("resolveKbArticleRecord", () => {
  const record = (designation: string) => ({ designation, textUnavailableReason: null });

  it("opens the first candidate anchor present in the code", () => {
    const ref = parseKbArticleRef("ст. 217.1 НК РФ")!;
    expect(resolveKbArticleRecord(record("ст. 217.1 НК РФ"), CODES, ["st-217s1"])).toEqual({
      kind: "open",
      slug: "nk-rf-146-fz-ch-i-117-fz-ch-ii",
      anchor: "st-217s1",
      ref,
    });
    expect(resolveKbArticleRecord(record("ч. 17 ст. 51 ГрК РФ"), CODES, ["st-51"])).toMatchObject({ kind: "open", anchor: "st-51" });
  });

  it("gives a reason when the code has no text or the place is not in it", () => {
    expect(resolveKbArticleRecord(record("ст. 26 ЖК РФ"), CODES, [])).toMatchObject({ kind: "reason", why: "codeMissing", codeLabel: "ЖК РФ" });
    expect(resolveKbArticleRecord(record("ст. 19.1 ТК РФ"), CODES, ["st-19"])).toMatchObject({ kind: "reason", why: "notFound" });
  });

  it("leaves a record that is not about an article alone, and keeps a reason the base already gives", () => {
    expect(resolveKbArticleRecord(record("ПП РФ №354"), CODES, [])).toBeNull();
    expect(resolveKbArticleRecord({ ...record("ст. 48.2 ГрК РФ"), folder: "other" }, CODES, ["st-48s2"])).toBeNull();
    expect(resolveKbArticleRecord({ ...record("ст. 220 НК РФ"), folder: "laws" }, CODES, ["st-220"])).toMatchObject({ kind: "open" });
    expect(resolveKbArticleRecord({ designation: "ст. 26 ЖК РФ", textUnavailableReason: "Своя причина." }, CODES, [])).toBeNull();
  });
});

describe("kbArticleReason", () => {
  const t = (key: string, vars?: Record<string, unknown>) => `${key}|${vars?.code ?? ""}`;
  it("words the two reasons through the locale", () => {
    expect(kbArticleReason({ kind: "reason", why: "codeMissing", codeLabel: "ЖК РФ" }, t)).toBe(
      "home.knowledgeBase.article.codeMissing|ЖК РФ",
    );
    expect(kbArticleReason({ kind: "reason", why: "notFound", codeLabel: "ТК РФ" }, t)).toBe("home.knowledgeBase.article.notFound|ТК РФ");
    expect(kbArticleReason(null, t)).toBeNull();
  });
});

describe("review round 1 (9.9)", () => {
  const record = (designation: string) => ({ designation, textUnavailableReason: null, folder: "laws" });
  const MORE = [
    ...CODES.filter((c) => c.slug !== "190-fz-ot-27-07-2010"),
    { slug: "190-fz-ot-27-07-2010", designation: "190-ФЗ от 27.07.2010" },
    { slug: "zk-rf-136-fz", designation: "ЗК РФ, 136-ФЗ" },
    { slug: "2395-1-ot-21-02-1992", designation: "2395-1 от 21.02.1992" },
  ];

  it("an index spelling «55.5-1» or «39¹⁻²» is not a range: only index anchors are tried", () => {
    expect(parseKbArticleRef("ст. 55.5-1 ГрК РФ")?.candidates).toEqual(["st-55s5-1", "st-55s5s1", "st-55-5-1"]);
    expect(parseKbArticleRef("ст. 39¹⁻² НК РФ")?.candidates).toEqual(["st-39s1-2", "st-39s1s2", "st-39-1-2"]);
    expect(parseKbArticleRef("ст. 702-729 ГК РФ")?.candidates).toEqual(["st-702"]);
    expect(resolveKbArticleRecord(record("ст. 55.5-1 ГрК РФ"), MORE, ["st-55s5"])).toMatchObject({ kind: "reason", why: "notFound" });
    // A dotted range opens at its first article, whatever the head of the end is.
    expect(parseKbArticleRef("ст. 7.30-7.32 КоАП РФ")?.candidates).toEqual(["st-7-30", "st-7s30"]);
    expect(parseKbArticleRef("ст. 1.1-1.3 КоАП РФ")?.candidates).toEqual(["st-1-1", "st-1s1"]);
  });

  it("keys a code also by its law number and a bare law number «2395-1»", () => {
    expect(pickKbCode("136-ФЗ", MORE)?.slug).toBe("zk-rf-136-fz");
    expect(pickKbCode("№2395-1", MORE)?.slug).toBe("2395-1-ot-21-02-1992");
    expect(parseKbArticleRef("ст. 5 №218-ФЗ")?.code).toBe("218-ФЗ");
  });

  it("an ambiguous number gives no promise: «190-ФЗ» is ГрК and the heat law, two «69-ФЗ»", () => {
    const t = (key: string) => key;
    const amb = resolveKbArticleRecord(record("ст. 5 190-ФЗ"), MORE, ["st-5"]);
    expect(amb).toMatchObject({ kind: "reason", why: "ambiguous" });
    expect(kbArticleReason(amb, t)).toBeNull();
    expect(resolveKbArticleRecord(record("ст. 5 69-ФЗ"), MORE, [])).toMatchObject({ why: "ambiguous" });
    expect(resolveKbArticleRecord(record("ст. 19.1 Закона РФ №2395-1"), MORE, [])).toMatchObject({ why: "notFound" });
  });
});
