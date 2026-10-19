import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIContextPack } from "@/lib/ai-project-context";
import * as opener from "@/lib/ai-sidebar-opener";
import { buildSidebarOpener, isSidebarOpenerKillSwitchEnabled, type SidebarOpenerInput } from "@/lib/ai-sidebar-opener";

/** Keys plus their interpolation, so a test can assert both without the locales. */
const t = (key: string, options?: Record<string, unknown>) =>
  options && Object.keys(options).length > 0 ? `${key}|${JSON.stringify(options)}` : key;

function pack(overrides: Partial<AIContextPack> = {}): AIContextPack {
  return {
    project: { title: "Дом", type: "residential", progress: "40%" },
    stages: [],
    tasks: { total: 10, done: 4, blocked: 0 },
    estimate: { hasEstimate: true, status: "approved", stages: 3, lines: 20 },
    procurement: { total: 5, requested: 0, ordered: 5, inStock: 0 },
    user: { role: "owner" },
    members: 3,
    recentEvents: [],
    _meta: { hiddenDomains: [] },
    ...overrides,
  };
}

function build(overrides: Partial<SidebarOpenerInput> = {}) {
  return buildSidebarOpener({ ctx: pack(), compact: false, quotaExhausted: false, t, ...overrides });
}

describe("kill switch", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("stays on when unset or empty", () => {
    vi.stubEnv("VITE_AI_SIDEBAR_OPENER", "");
    expect(isSidebarOpenerKillSwitchEnabled()).toBe(false);
  });

  it("turns off only on the four off-words", () => {
    for (const off of ["0", "false", "no", "off", "OFF", " False "]) {
      vi.stubEnv("VITE_AI_SIDEBAR_OPENER", off);
      expect(isSidebarOpenerKillSwitchEnabled()).toBe(true);
    }
  });
});

describe("the old signals are gone (slice 8)", () => {
  it("exports only the chip row and the kill switch: no signal catalogue, no domain narrowing", () => {
    expect(Object.keys(opener).sort()).toEqual(["buildSidebarOpener", "isSidebarOpenerKillSwitchEnabled"]);
  });

  it("says no count about the tasks, whatever their state", () => {
    for (const tasks of [
      { total: 6, done: 6, blocked: 0 },
      { total: 10, done: 4, blocked: 2 },
      { total: 10, done: 9, blocked: 0 },
    ]) {
      const result = build({ ctx: pack({ tasks }) });
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toMatch(/^ai\.sidebar\.opener\.signal\.fallback\|/);
      expect(result).not.toHaveProperty("headline");
      expect(result).not.toHaveProperty("intro");
    }
  });

  it("keeps a hidden domain out of the neutral line", () => {
    const line = build({ ctx: pack({ procurement: null }) }).lines[0];
    expect(line).not.toContain("domain.procurement");
    expect(line).toContain("domain.tasks");
  });

  it("shows no domain list before the pack exists", () => {
    const result = build({ ctx: null });
    expect(result.lines).toEqual(["ai.sidebar.opener.signal.fallbackNoContext"]);
    expect(result.chips.map((c) => c.key)).toEqual(["ai.sidebar.suggestion.draftWeeklyReport"]);
  });
});

describe("chips", () => {
  it("returns three distinct chips, two on a narrow panel", () => {
    const keys = build().chips.map((c) => c.key);
    expect(new Set(keys).size).toBe(3);
    expect(build({ compact: true }).chips).toHaveLength(2);
  });

  it("leads with the blocked-task questions when a task is blocked", () => {
    const keys = build({ ctx: pack({ tasks: { total: 10, done: 4, blocked: 2 } }) }).chips.map((c) => c.key);
    expect(keys[0]).toBe("ai.sidebar.suggestion.whatBlocksTasks");
  });

  it("drops a chip that leads into a hidden domain", () => {
    const ctx = pack({ tasks: { total: 6, done: 6, blocked: 0 }, estimate: null });
    const keys = build({ ctx }).chips.map((c) => c.key);
    expect(keys).not.toContain("ai.sidebar.suggestion.compareEstimates");
    expect(keys).toHaveLength(3);
  });

  it("adds the credits line only when the quota is exhausted", () => {
    expect(build().quotaNote).toBeUndefined();
    expect(build({ quotaExhausted: true }).quotaNote).toBe("ai.sidebar.opener.quotaExhausted");
  });
});

describe("client report chip", () => {
  const CHIP = "ai.sidebar.suggestion.clientStatus";
  const allDone = () => pack({ tasks: { total: 6, done: 6, blocked: 0 } });

  it("is offered on a finished or nearly finished project when the dialog is available", () => {
    expect(build({ ctx: allDone(), clientReport: true }).chips.map((c) => c.key)).toContain(CHIP);
    const nearly = pack({ tasks: { total: 10, done: 9, blocked: 0 } });
    expect(build({ ctx: nearly, clientReport: true }).chips.map((c) => c.key)).toContain(CHIP);
  });

  it("is left out for a member who cannot open the dialog, and the row stays full", () => {
    const keys = build({ ctx: allDone(), clientReport: false }).chips.map((c) => c.key);
    expect(keys).not.toContain(CHIP);
    expect(keys).toHaveLength(3);
  });
});
