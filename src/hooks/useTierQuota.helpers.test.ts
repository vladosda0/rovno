import { describe, expect, it } from "vitest";
import { planMeets, selectAiUsage, type TierQuota } from "@/hooks/useTierQuota";

const quota: TierQuota = {
  plan_code: "master",
  ai_chat_used: 10,
  ai_chat_limit: 500,
  ai_doc_used: 2,
  ai_doc_limit: 10,
  ai_photo_used: 4,
  ai_photo_limit: 15,
  estimates_used: 0,
  estimates_limit: -1,
  period_start: "2026-05-01T00:00:00.000Z",
  period_end: "2026-06-01T00:00:00.000Z",
};

describe("planMeets", () => {
  it("treats higher tiers as satisfying lower requirements", () => {
    expect(planMeets("brigade", "master")).toBe(true);
    expect(planMeets("master", "master")).toBe(true);
    expect(planMeets("brigade", "brigade")).toBe(true);
  });

  it("rejects lower tiers", () => {
    expect(planMeets("free", "master")).toBe(false);
    expect(planMeets("master", "brigade")).toBe(false);
  });

  it("returns false for missing/unknown plans", () => {
    expect(planMeets(undefined, "master")).toBe(false);
    expect(planMeets("mystery", "brigade")).toBe(false);
  });
});

describe("selectAiUsage", () => {
  it("maps each usage type to its used/limit pair", () => {
    expect(selectAiUsage(quota, "chat")).toEqual({ used: 10, limit: 500 });
    expect(selectAiUsage(quota, "doc")).toEqual({ used: 2, limit: 10 });
    expect(selectAiUsage(quota, "photo")).toEqual({ used: 4, limit: 15 });
  });
});
