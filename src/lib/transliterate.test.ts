import { describe, expect, it } from "vitest";
import { transliterateCyrillic, slugifyOrgName, isValidOrgSlug } from "@/lib/transliterate";

describe("transliterateCyrillic", () => {
  it("transliterates Cyrillic per the documented table", () => {
    expect(transliterateCyrillic("Студень")).toBe("studen");
    expect(transliterateCyrillic("Щука")).toBe("shchuka");
    expect(transliterateCyrillic("Яхта")).toBe("yakhta");
    expect(transliterateCyrillic("Цемент")).toBe("tsement");
  });
});

describe("slugifyOrgName", () => {
  it("produces valid slugs from Cyrillic names", () => {
    expect(slugifyOrgName("Моя Бригада")).toBe("moya-brigada");
    expect(slugifyOrgName("Студень")).toBe("studen");
    expect(isValidOrgSlug(slugifyOrgName("Моя Бригада"))).toBe(true);
  });

  it("returns an empty string for names without usable characters", () => {
    expect(slugifyOrgName("!!!")).toBe("");
  });
});
