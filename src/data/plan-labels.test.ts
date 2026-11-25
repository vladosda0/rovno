import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "@/data/plans";
import { planDisplayName, planPriceLabel } from "@/data/plan-labels";

describe("planDisplayName (site-redesign 1.4)", () => {
  it("names the free plan «Старт» in the interface", () => {
    expect(planDisplayName("free")).toBe("Старт");
  });

  it("keeps the paid plan names from the catalog", () => {
    expect(planDisplayName("master")).toBe("Мастер");
    expect(planDisplayName("brigade")).toBe("Бригада");
  });

  it("falls back to the raw code for an unknown plan", () => {
    expect(planDisplayName("legacy_pro")).toBe("legacy_pro");
  });

  it("keeps the price of the free plan «Бесплатно»", () => {
    expect(planPriceLabel("free")).toBe("Бесплатно");
  });

  it("does not touch the catalog mirrored from rovno-db (verify-plans-sync)", () => {
    expect(PLANS.free.display_name).toBe("Бесплатно");
  });

  it("leaves no `PLANS[…].display_name` label in the interface outside the helper", () => {
    const files = [
      "src/components/settings/panels/BillingPanel.tsx",
      "src/components/billing/PaymentDetailDialog.tsx",
      "src/components/billing/TierLockTooltip.tsx",
      "src/components/billing/PlansDialog.tsx",
      "src/components/billing/SubscriptionSection.tsx",
      "src/components/billing/PaymentHistory.tsx",
      "src/pages/billing/Checkout.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/display_name/);
    }
  });

  it("says «Старт» in the Russian strings about the free plan", () => {
    const ru = JSON.parse(readFileSync(path.resolve(process.cwd(), "src/locales/ru.json"), "utf8"));
    expect(ru["pricing.plans.free.name"]).toBe("Старт");
    expect(ru["plans.dialog.freePrice"]).toBe("Бесплатно");
    for (const [key, value] of Object.entries(ru)) {
      expect(String(value), key).not.toMatch(/тариф[еау]? «?Бесплатно»?/i);
    }
  });
});
