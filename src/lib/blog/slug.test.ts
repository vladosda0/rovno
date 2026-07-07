import { describe, expect, it } from "vitest";
import { slugifyTitle, validateSlug } from "./slug";

describe("slugifyTitle", () => {
  it("transliterates Russian titles", () => {
    expect(slugifyTitle("Как вести смету")).toBe("kak-vesti-smetu");
    expect(slugifyTitle("Щебень и ёлки")).toBe("scheben-i-elki");
    expect(slugifyTitle("Объём работ")).toBe("obem-rabot");
  });

  it("collapses punctuation and whitespace into single hyphens", () => {
    expect(slugifyTitle("Смета — это просто!  (правда)")).toBe("smeta-eto-prosto-pravda");
  });

  it("keeps latin and digits", () => {
    expect(slugifyTitle("Топ-10 ошибок в Excel")).toBe("top-10-oshibok-v-excel");
  });

  it("trims leading/trailing separators", () => {
    expect(slugifyTitle("«Цитата»")).toBe("tsitata");
  });

  it("returns empty string for symbol-only input", () => {
    expect(slugifyTitle("!!!")).toBe("");
  });

  it("caps length at 120 without a trailing hyphen", () => {
    const slug = slugifyTitle("слово ".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts a normal slug", () => {
    expect(validateSlug("kak-vesti-smetu")).toBeNull();
  });

  it("rejects reserved slugs (admin surface collision)", () => {
    expect(validateSlug("admin")).toBe("reserved");
    expect(validateSlug("feed")).toBe("reserved");
  });

  it("rejects bad formats", () => {
    expect(validateSlug("Плохой")).toBe("format");
    expect(validateSlug("-lead")).toBe("format");
    expect(validateSlug("a--b")).toBe("format");
    expect(validateSlug("UPPER")).toBe("format");
  });

  it("rejects out-of-range lengths", () => {
    expect(validateSlug("ab")).toBe("too_short");
    expect(validateSlug("a".repeat(121))).toBe("too_long");
    expect(validateSlug("")).toBe("empty");
  });
});
