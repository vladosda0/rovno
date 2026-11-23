// site-redesign 1.8: what crawlers and agents read about the site.
import { describe, expect, it } from "vitest";
import { STATIC_ROUTES, llmsTxt } from "../../scripts/lib/site-index.mjs";

describe("llms.txt and sitemap routes (1.8)", () => {
  const text = llmsTxt([{ title: "Статья", slug: "statya", excerpt: "Коротко" }]);

  it("names the plans «Старт / Мастер / Бригада» with prices", () => {
    expect(text).toContain("Старт / Мастер / Бригада");
    expect(text).not.toContain("Бесплатно / Мастер");
    expect(text).toMatch(/990/);
    expect(text).toMatch(/2 990/);
  });

  it("points to the knowledge base and the legal pages", () => {
    expect(text).toContain("https://rovno.ai/baza/");
    for (const route of ["/offer/", "/privacy/", "/refund/", "/contacts/"]) {
      expect(text).toContain(`https://rovno.ai${route}`);
    }
  });

  it("lists every social profile with a public address", () => {
    expect(text).toContain("https://t.me/stroyrovno");
    expect(text).toContain("https://vk.ru/rovnoai");
    expect(text).toContain("https://t.me/ai_v_stroike");
  });

  it("keeps the articles", () => {
    expect(text).toContain("- [Статья](https://rovno.ai/blog/statya/): Коротко");
  });

  it("the sitemap advertises the landing and the four legal pages", () => {
    expect(STATIC_ROUTES).toEqual(expect.arrayContaining(["/", "/offer/", "/privacy/", "/refund/", "/contacts/"]));
  });
});
