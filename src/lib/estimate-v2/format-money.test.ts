import { describe, expect, it } from "vitest";
import { formatCompactMoney, formatMoney } from "@/lib/estimate-v2/format-money";

// Intl may use NBSP / narrow NBSP as group separators depending on ICU version.
function normalize(value: string): string {
  return value.replace(/[\u00A0\u202F]/g, " ");
}

describe("formatMoney", () => {
  it("formats the full amount with kopecks (Берёзки-1 client total)", () => {
    expect(normalize(formatMoney(567_235_926, "RUB"))).toBe("5 672 359,26 ₽");
  });

  it("keeps two decimals on round amounts", () => {
    expect(normalize(formatMoney(100_00, "RUB"))).toBe("100,00 ₽");
  });

  it("formats zero", () => {
    expect(normalize(formatMoney(0, "RUB"))).toBe("0,00 ₽");
  });
});

describe("formatCompactMoney", () => {
  it("produces the dense million form (Берёзки-1 revenue)", () => {
    expect(normalize(formatCompactMoney(464_947_500, "RUB"))).toBe("4,65 млн ₽");
  });

  it("produces the thousand form", () => {
    expect(normalize(formatCompactMoney(1_917_600, "RUB"))).toBe("19,18 тыс. ₽");
  });

  it("keeps small amounts uncompacted", () => {
    expect(normalize(formatCompactMoney(10_00, "RUB"))).toBe("10,00 ₽");
  });
});
