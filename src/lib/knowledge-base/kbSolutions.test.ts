import { describe, expect, it, vi } from "vitest";
import {
  kbClauseLabel,
  kbDefaultChoice,
  kbItemChips,
  kbItemVisible,
  kbShortDesignation,
  kbSolutionCheckedDate,
  kbSolutionDocuments,
  kbSolutionMatches,
  normalizeKbSolution,
} from "./kbSolutions.mjs";
import { SEAMS_ROW, SOLUTION_ROW, solutionRow } from "./kbSolutions.fixture";

const solution = normalizeKbSolution(SOLUTION_ROW);

describe("«Решения» helpers", () => {
  it("normalises a card with its facts in position order and the review date", () => {
    expect(solution.facts.map((f) => f.position)).toEqual([1, 4, 5, 6]);
    expect(solution.conditions.map((c) => c.key)).toEqual(["base", "zone"]);
    expect(kbSolutionCheckedDate(solution)).toBe("25.10.2026");
    expect(kbSolutionCheckedDate({ ...solution, checkedAt: "2026-10-24T03:00:00+00:00" })).toBe("24.10.2026");
    expect(kbSolutionDocuments(solution)).toEqual(["СП 163.1325800", "СП 71.13330"]);
  });

  it("opens on the first option of every condition and shows an item only when its whole case matches", () => {
    const choice = kbDefaultChoice(solution);
    expect(choice).toEqual({ base: "gklv", zone: "wet" });
    expect(solution.steps.map((s) => kbItemVisible(s, choice))).toEqual([true, true, false, true]);
    const mineralDry = { base: "mineral", zone: "dry" };
    expect(solution.steps.map((s) => kbItemVisible(s, mineralDry))).toEqual([false, false, true, true]);
    expect(kbItemVisible(solution.steps[0], { base: "gklv", zone: "dry" })).toBe(false);
  });

  it("builds chips «СП 163, п. 6.4.2.8» from the cited facts", () => {
    expect(kbShortDesignation("СП 163.1325800")).toBe("СП 163");
    expect(kbShortDesignation("СП 23-103-2003")).toBe("СП 23-103-2003");
    expect(kbClauseLabel("p-6-4-2-8")).toBe("п. 6.4.2.8");
    expect(kbClauseLabel("p-pril-b")).toBe("прил. Б");
    expect(kbClauseLabel("p-pril-zh-2")).toBe("п. Ж.2");
    const [chip] = kbItemChips(solution, solution.steps[0]);
    expect(chip).toMatchObject({
      label: "СП 163, п. 6.4.2.8",
      heading: "СП 163.1325800 · п. 6.4.2.8",
      quotes: ["должны быть покрыты гидроизолирующим составом"],
      docSlug: "sp-163-1325800",
      anchor: "p-6-4-2-8",
    });
    expect(kbItemChips(solution, solution.numbers[1])[0].label).toBe("СП 71, прил. Б");
  });

  it("keeps one chip per clause with the quote of every fact cited from it", () => {
    const seams = normalizeKbSolution(SEAMS_ROW);
    const chips = kbItemChips(seams, seams.numbers[0]);
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("СП 71, п. 7.4.13");
    expect(chips[0].quotes).toEqual([
      "швы должны быть заполнены специальными шовными материалами",
      "допускается сокращение технологической паузы, если это предусмотрено ПР или требованием производителя материала клеевой прослойки",
    ]);
  });

  it("shows the check date on the Moscow calendar", () => {
    expect(kbSolutionCheckedDate({ ...solution, checkedAt: "2026-10-27T22:31:00Z" })).toBe("28.10.2026");
    expect(kbSolutionCheckedDate({ ...solution, checkedAt: "2026-10-27T20:59:00Z" })).toBe("27.10.2026");
    expect(kbSolutionCheckedDate({ ...solution, checkedAt: null })).toBeNull();
  });

  it("hides an item whose «when» names an unknown key or option or a non-string option, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = SOLUTION_ROW.body as Record<string, unknown>;
    const row = solutionRow({
      slug: "odd-when-card",
      body: {
        ...body,
        steps: [
          { text: "Опечатка в ключе.", facts: [], when: { base: "gklv", zona: "wet" } },
          { text: "Число вместо варианта.", facts: [], when: { zone: 1 } },
          { text: "Опечатка в варианте.", facts: [], when: { zone: "wett" } },
          { text: "Служебный ключ.", facts: [], when: JSON.parse('{"__proto__":"wet"}') },
          { text: "Верное условие.", facts: [], when: { zone: "wet" } },
        ],
      },
    });
    const odd = normalizeKbSolution(row);
    const cases = [
      { base: "gklv", zone: "wet" },
      { base: "gklv", zone: "dry" },
      { base: "mineral", zone: "wet" },
      { base: "mineral", zone: "dry" },
    ];
    for (const step of odd.steps.slice(0, 4)) for (const c of cases) expect(kbItemVisible(step, c)).toBe(false);
    expect(cases.map((c) => kbItemVisible(odd.steps[4], c))).toEqual([true, false, true, false]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('zona="wet"');
    expect(warn.mock.calls[0][0]).toContain("zone=1");
    expect(warn.mock.calls[0][0]).toContain('zone="wett"');
    normalizeKbSolution(row);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockClear();
    normalizeKbSolution(SOLUTION_ROW);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("lists a repeated quote once and keeps clauses of different documents apart even with the same short label", () => {
    const base = normalizeKbSolution(SOLUTION_ROW);
    const fact = (position: number, docId: string, designation: string, quote: string) => ({
      position, fact: "Факт", docId, docSlug: docId.toLowerCase(), designation, anchor: "p-5-1", quote,
    });
    const solution = { ...base, facts: [
      fact(1, "SP-A", "СП 70.13330.2012", "одна цитата"),
      fact(2, "SP-A", "СП 70.13330.2012", "одна цитата"),
      fact(3, "SP-B", "СП 70.13330.2023", "другая цитата"),
    ] };
    const chips = kbItemChips(solution, { text: "Шаг", facts: [1, 2, 3], when: null, recommendation: false });
    expect(chips).toHaveLength(2);
    expect(chips[0].quotes).toEqual(["одна цитата"]);
    expect(chips[1].quotes).toEqual(["другая цитата"]);
    expect(chips[1].docSlug).toBe("sp-b");
  });

  it("searches the title, summary, steps and fact texts", () => {
    expect(kbSolutionMatches(solution, "санузле")).toBe(true);
    expect(kbSolutionMatches(solution, "ванной")).toBe(true);
    expect(kbSolutionMatches(solution, "НАПРАВЛЯЮЩУЮ")).toBe(true);
    expect(kbSolutionMatches(solution, "воздействием влаги")).toBe(true);
    expect(kbSolutionMatches(solution, "кровля")).toBe(false);
  });
});
