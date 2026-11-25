import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ruLocale from "@/locales/ru.json";
import {
  CARD_COVER_KEYS,
  CARD_SHADE_CHOICES,
  NEW_CARD_SHADE,
  cardCoverSrc,
  cardInitials,
  cardShade,
  coverMatches,
  coverPresetSrc,
  orderCovers,
  linkLabel,
  mailLink,
  normalizeTelegram,
  requisiteLines,
  telLink,
  telegramFieldValue,
  telegramLink,
  webLink,
  whatsappLink,
} from "@/lib/contractor-card";
import type { PartyDetails } from "@/data/requisites-lookup-source";

describe("contractor card links", () => {
  it("builds a phone link from what a person typed", () => {
    expect(telLink("+7 812 000-00-00")).toBe("tel:+78120000000");
    expect(telLink("8 (921) 000-00-00")).toBe("tel:+79210000000");
    expect(telLink("+7 8 921 000-00-00")).toBe("tel:+79210000000");
    expect(telLink("921 000-00-00")).toBe("tel:+79210000000");
    expect(telLink("+49 30 123456")).toBe("tel:+4930123456");
    expect(telLink("+84 912 345 678")).toBe("tel:+84912345678");
    expect(telLink("+7 ")).toBeNull();
    expect(telLink(undefined)).toBeNull();
  });

  it("opens a WhatsApp chat by the number", () => {
    expect(whatsappLink("+7 921 000-00-00")).toBe("https://wa.me/79210000000");
    expect(whatsappLink("")).toBeNull();
  });

  it("refuses an email that would smuggle mail headers", () => {
    expect(mailLink("hello@remont-plus.ru")).toBe("mailto:hello@remont-plus.ru");
    expect(mailLink("a@b.ru?bcc=x@y.ru")).toBeNull();
    expect(mailLink("not an email")).toBeNull();
  });

  it("opens Telegram by name, by link and by a private invite", () => {
    expect(telegramLink("@remontplus")).toBe("https://t.me/remontplus");
    expect(telegramLink("remontplus")).toBe("https://t.me/remontplus");
    expect(telegramLink("t.me/remontplus")).toBe("https://t.me/remontplus");
    expect(telegramLink("https://t.me/+AbCd")).toBe("https://t.me/+AbCd");
    expect(telegramLink("https://evil.example/t.me")).toBeNull();
    expect(telegramLink("имя с пробелом")).toBeNull();
  });

  it("keeps the @ out of the field and in the stored value", () => {
    expect(normalizeTelegram(" remontplus ")).toBe("@remontplus");
    expect(normalizeTelegram("@remontplus")).toBe("@remontplus");
    expect(normalizeTelegram("t.me/+AbCd")).toBe("t.me/+AbCd");
    expect(normalizeTelegram("  ")).toBe("");
    expect(telegramFieldValue("@remontplus")).toBe("remontplus");
  });

  it("gives only web addresses a link", () => {
    expect(webLink("remont-plus.ru")).toBe("https://remont-plus.ru/");
    expect(webLink("http://vk.com/remontplus")).toBe("http://vk.com/remontplus");
    expect(webLink("javascript:alert(1)")).toBeNull();
    expect(webLink("data:text/html,x")).toBeNull();
    expect(webLink("localhost")).toBeNull();
    expect(linkLabel("https://www.vk.com/remontplus/")).toBe("vk.com/remontplus");
  });
});

describe("contractor card design", () => {
  it("falls back to graphite for an empty or unknown shade", () => {
    expect(cardShade(undefined).key).toBe("graphite");
    expect(cardShade("neon").key).toBe("graphite");
    expect(cardShade("olive").key).toBe("olive");
  });

  it("makes a monogram from the name without the legal form", () => {
    expect(cardInitials("ООО «Ремонт-Плюс»")).toBe("РП");
    expect(cardInitials("ИП Иванов")).toBe("ИВ");
    expect(cardInitials("Бригада Сергея")).toBe("БС");
    expect(cardInitials("")).toBe("?");
  });
});

describe("requisite lines", () => {
  const details: PartyDetails = {
    type: "legal",
    legalName: "ООО «РЕМОНТ-ПЛЮС»",
    inn: "7800000000",
    kpp: "780001001",
    ogrn: "1027800000000",
    legalAddress: "г. Санкт-Петербург",
    addressIncomplete: false,
    addressHint: null,
    signatoryName: "Иванов Иван Иванович",
    signatoryPosition: "Генеральный директор",
    status: "active",
  };

  it("lists everything the registry gave", () => {
    expect(requisiteLines("7800000000", details).map((line) => line.value)).toEqual([
      "ООО «РЕМОНТ-ПЛЮС»",
      "7800000000 · 780001001",
      "1027800000000",
      "г. Санкт-Петербург",
      "Генеральный директор Иванов Иван Иванович",
    ]);
  });

  it("leaves out what a sole trader does not have", () => {
    const ip = { ...details, type: "individual" as const, kpp: null, signatoryName: null, signatoryPosition: null };
    expect(requisiteLines("780000000000", ip).map((line) => line.key)).toEqual(["legalName", "inn", "ogrn", "legalAddress"]);
  });

  it("shows only the INN when the registry did not answer", () => {
    expect(requisiteLines(" 7800000000 ", null)).toEqual([{ key: "inn", value: "7800000000" }]);
  });
});

describe("ready-made covers (rovno#295)", () => {
  const ru = (ruLocale as unknown) as Record<string, string>;
  const P = "upload.modal.step3.visitka.appearance.covers.";
  const covers = CARD_COVER_KEYS.map((key) => ({
    key,
    name: ru[`${P}${key}.name`],
    tags: ru[`${P}${key}.tags`].split(",").map((tag) => tag.trim()),
  }));
  const found = (query: string) => covers.filter((cover) => coverMatches(query, cover.name, cover.tags)).map((cover) => cover.key);

  it("has 24 covers, each with a Russian name and up to three tags", () => {
    expect(CARD_COVER_KEYS).toHaveLength(24);
    for (const cover of covers) {
      expect(cover.name).toBeTruthy();
      expect(cover.tags.length).toBeGreaterThan(0);
      expect(cover.tags.length).toBeLessThanOrEqual(3);
    }
  });

  it("finds covers by the start of any word of the name or a tag", () => {
    expect(found("дом")).toEqual(["house", "timber", "smarthome"]);
    expect(found("Кров")).toEqual(["roofing"]);
    expect(found("котел")).toEqual(["heating"]);
    expect(found("гарнитур")).toEqual(["kitchen"]);
    expect(found("бассейн")).toEqual([]);
    expect(found("  ")).toHaveLength(24);
  });

  it("moves the saved cover first only when it would be hidden", () => {
    const list = covers.map(({ key }) => ({ key }));
    expect(orderCovers(list, "landscape", 8)[0].key).toBe("landscape");
    expect(orderCovers(list, "landscape", 8)).toHaveLength(24);
    expect(orderCovers(list, "tiling", 8)).toBe(list);
    expect(orderCovers(list, null, 8)).toBe(list);
  });

  it("shows an uploaded cover over a ready-made one, and drops an unknown key", () => {
    expect(cardCoverSrc({ cover_preset: "house" })).toBe("/visitka-covers/house.webp");
    expect(cardCoverSrc({ cover_url: "https://cdn/c.jpg", cover_preset: "house" })).toBe("https://cdn/c.jpg");
    expect(cardCoverSrc({ cover_preset: "pool" })).toBeNull();
    expect(cardCoverSrc({})).toBeNull();
    expect(coverPresetSrc("house", "small")).toBe("/visitka-covers/house-sm.webp");
  });

  it("offers five shades without graphite, a new card on Rovno blue", () => {
    expect(CARD_SHADE_CHOICES.map((shade) => shade.key)).toEqual(["rovno_blue", "olive", "brick", "emerald", "sand"]);
    expect(NEW_CARD_SHADE).toBe("rovno_blue");
    expect(cardShade("graphite").key).toBe("graphite");
  });
});

describe("ready-made cover files", () => {
  it("ships a full and a small picture for every key", () => {
    for (const key of CARD_COVER_KEYS) {
      expect(existsSync(`public${coverPresetSrc(key)}`), key).toBe(true);
      expect(existsSync(`public${coverPresetSrc(key, "small")}`), key).toBe(true);
    }
  });
});
