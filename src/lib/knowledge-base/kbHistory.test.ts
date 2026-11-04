import { describe, expect, it } from "vitest";
import { kbHasUpcoming, kbHistoryEntries, normalizeUpcomingAmendments } from "./kbHistory.mjs";

const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

describe("kbHistoryEntries", () => {
  it("puts the future entry first, then the past by date, newest first", () => {
    const entries = kbHistoryEntries(
      [
        { occurred_on: "2026-10-22", event: "text_checked" },
        { occurred_on: "2025-10-03", event: "amendment_effective", amendment_no: 4, link_url: "https://minstroyrf.gov.ru/docs/475045/" },
        { occurred_on: "2027-06-01", event: "amendment_upcoming", amendment_no: 5, link_url: "https://minstroyrf.gov.ru/docs/500100/", is_future: true },
      ],
      t,
      { appliedList: "1-4" },
    );
    expect(entries.map((e) => [e.date, e.future])).toEqual([
      ["01.06.2027", true],
      ["22.10.2026", false],
      ["03.10.2025", false],
    ]);
    expect(entries[0].text).toBe("home.knowledgeBase.history.upcoming");
    expect(entries[0].link).toEqual({
      href: "https://minstroyrf.gov.ru/docs/500100/",
      label: 'home.knowledgeBase.history.amendment:{"no":5}',
      external: true,
    });
    expect(entries[1].text).toBe('home.knowledgeBase.history.textCheckedWith:{"list":"1-4"}');
  });

  it("links a replaced document to its replacement inside the app", () => {
    const [entry] = kbHistoryEntries(
      [{ occurred_on: "2026-11-01", event: "replaced", replaced_by_slug: "sp-999-13330", replaced_by_designation: "СП 999.13330" }],
      t,
    );
    expect(entry.link).toEqual({ href: "/baza/sp-999-13330/", label: "СП 999.13330", external: false });
  });

  it("skips unknown events and rows without a date", () => {
    expect(kbHistoryEntries([{ occurred_on: "2026-11-01", event: "something" }, { event: "cancelled" }], t)).toEqual([]);
  });

  it("gives pending amendments without a journal row their own line under the future ones", () => {
    const entries = kbHistoryEntries(
      [
        { occurred_on: "2027-06-01", event: "amendment_upcoming", amendment_no: 6, is_future: true },
        { occurred_on: "2026-10-22", event: "text_checked" },
        { occurred_on: "2026-11-05", event: "amendment_pending", amendment_no: 5, link_url: "https://minstroyrf.gov.ru/docs/1/" },
      ],
      t,
      { pending: [{ no: 5, url: "https://minstroyrf.gov.ru/docs/1/" }, { no: 3, url: null }] },
    );
    expect(entries.map((e) => [e.date, e.text])).toEqual([
      ["01.06.2027", "home.knowledgeBase.history.upcoming"],
      [null, 'home.knowledgeBase.pending.missingOne:{"list":"3"}'],
      ["05.11.2026", "home.knowledgeBase.history.pending"],
      ["22.10.2026", "home.knowledgeBase.history.textChecked"],
    ]);
    expect(entries[2].suffix).toBe("home.knowledgeBase.history.pendingSuffix");
  });

  it("names the document that put a solution card on recheck", () => {
    const [entry] = kbHistoryEntries([{ occurred_on: "2027-06-01", event: "solution_checking", doc_designation: "СП 29.13330" }], t);
    expect(entry.text).toBe('home.knowledgeBase.history.solutionCheckingDoc:{"doc":"СП 29.13330"}');
  });
});

describe("upcoming amendments", () => {
  it("keeps only rows with a number and a date, ordered by date", () => {
    expect(
      normalizeUpcomingAmendments([
        { no: 6, effective_from: "2027-09-01" },
        { no: 5, url: "https://minstroyrf.gov.ru/docs/500100/", effective_from: "2027-06-01" },
        { no: "x", effective_from: "2027-01-01" },
        { no: 7 },
      ]),
    ).toEqual([
      { no: 5, url: "https://minstroyrf.gov.ru/docs/500100/", effectiveFrom: "2027-06-01" },
      { no: 6, url: null, effectiveFrom: "2027-09-01" },
    ]);
  });

  it("shows the clock only on a document in force, and only while the date is ahead", () => {
    const upcoming = [{ no: 5, url: null, effectiveFrom: "2027-06-01" }];
    expect(kbHasUpcoming({ docStatus: "active", upcomingAmendments: upcoming }, "2026-11-04")).toBe(true);
    expect(kbHasUpcoming({ docStatus: "active", upcomingAmendments: upcoming }, "2027-06-01")).toBe(false);
    expect(kbHasUpcoming({ docStatus: "replaced", upcomingAmendments: upcoming }, "2026-11-04")).toBe(false);
    expect(kbHasUpcoming({ docStatus: "active", upcomingAmendments: [] }, "2026-11-04")).toBe(false);
  });

  it("one applied amendment reads in the singular", () => {
    const [entry] = kbHistoryEntries([{ occurred_on: "2026-10-22", event: "text_checked" }], t, { appliedList: "1" });
    expect(entry.text).toBe('home.knowledgeBase.history.textCheckedWithOne:{"list":"1"}');
  });
});
