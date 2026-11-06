import { describe, expect, it } from "vitest";
import ru from "@/locales/ru.json";
import { createTranslator } from "./kbPrerenderConfig.mjs";
import { kbChangeEntry, kbChangeMonths, kbChangesMonthLine, kbMonthLabel } from "./kbChanges.mjs";

const t = createTranslator(ru);
const text = (row: Record<string, unknown>) => {
  const entry = kbChangeEntry(row, t);
  return entry ? [entry.parts.map((p) => p.text).join(""), entry.note] : null;
};

const sp29 = { listed_on: "2026-11-10", doc_slug: "sp-29-13330", doc_heading: "СП 29.13330 · Полы" };

describe("kbChangeEntry (docs-library 8.4, mockup frame 2)", () => {
  it("an approved amendment: the date it comes into force and the clock note", () => {
    expect(text({ ...sp29, event: "amendment_approved", amendment_no: 5, effective_from: "2027-06-01" })).toEqual([
      "СП 29.13330 · Полы: утверждено Изменение № 5, вступит 01.06.2027",
      "Текст пока прежний, у метки значок часов",
    ]);
    const entry = kbChangeEntry({ ...sp29, event: "amendment_approved", amendment_no: 5 }, t)!;
    expect(entry.date).toBe("10.11.2026");
    expect(entry.parts[0]).toEqual({ text: "СП 29.13330 · Полы", doc: "sp-29-13330" });
  });

  it("a cancelled document with its replacement and the rechecked solutions", () => {
    const row = {
      listed_on: "2026-11-10",
      event: "replaced",
      doc_slug: "sp-71-13330",
      doc_heading: "СП 71.13330 · Изоляционные и отделочные покрытия",
      replaced_by_slug: "sp-71-13330-2026",
      replaced_by_heading: "СП 71.13330.2026",
      solutions_rechecked: 2,
    };
    expect(text(row)).toEqual([
      "СП 71.13330 · Изоляционные и отделочные покрытия: отменён, вместо него СП 71.13330.2026",
      "Решений на нём пересмотрено: 2",
    ]);
    expect(kbChangeEntry(row, t)!.parts.at(-1)).toEqual({ text: "СП 71.13330.2026", doc: "sp-71-13330-2026" });
    expect(text({ ...row, solutions_rechecked: 0 })![1]).toBeNull();
  });

  it("a new document, a cancellation without a replacement, an amendment in force", () => {
    expect(text({ listed_on: "2026-11-10", event: "document_added", doc_slug: "sp-515", doc_heading: "СП 515.1325800" })).toEqual([
      "СП 515.1325800: новый документ в базе",
      "Текст вписывается, метка «Проверяется»",
    ]);
    expect(text({ ...sp29, event: "cancelled" })).toEqual(["СП 29.13330 · Полы: отменён", null]);
    expect(text({ ...sp29, event: "replaced" })).toEqual(["СП 29.13330 · Полы: отменён", null]);
    expect(text({ ...sp29, event: "amendment_effective", amendment_no: 4 })).toEqual([
      "СП 29.13330 · Полы: вступило и вписано Изменение № 4",
      null,
    ]);
    expect(text({ ...sp29, event: "amendment_pending", amendment_no: 4 })).toEqual([
      "СП 29.13330 · Полы: вступило Изменение № 4, ещё не вписано в текст",
      "Текст вписывается, изменение пока читается на сайте Минстроя",
    ]);
  });

  it("a rewritten solution names what it was rewritten after", () => {
    const row = {
      listed_on: "2026-10-22",
      event: "solution_rechecked",
      solution_slug: "poly-v-sanuzle",
      solution_title: "Полы в санузле под плитку",
      after_doc_slug: "sp-29-13330",
      after_doc_heading: "СП 29.13330",
      after_amendment_no: 4,
      after_event: "amendment_effective",
    };
    expect(text(row)).toEqual([
      "Решение «Полы в санузле под плитку»: переписано после Изменения № 4 к СП 29.13330",
      "Сверено с источниками",
    ]);
    const entry = kbChangeEntry(row, t)!;
    expect(entry.parts[0]).toEqual({ text: "Решение «Полы в санузле под плитку»", solution: "poly-v-sanuzle" });
    expect(entry.parts.at(-1)).toEqual({ text: "СП 29.13330", doc: "sp-29-13330" });
    expect(text({ ...row, after_event: "replaced", after_amendment_no: null })![0]).toBe(
      "Решение «Полы в санузле под плитку»: переписано после отмены СП 29.13330",
    );
    expect(text({ ...row, after_doc_slug: null, after_doc_heading: null, after_amendment_no: null })![0]).toBe(
      "Решение «Полы в санузле под плитку»: переписано",
    );
  });

  it("skips unknown events and rows without a date or a subject", () => {
    expect(kbChangeEntry({ ...sp29, event: "not_checked" }, t)).toBeNull();
    expect(kbChangeEntry({ ...sp29, listed_on: null, event: "cancelled" }, t)).toBeNull();
    expect(kbChangeEntry({ listed_on: "2026-11-10", event: "cancelled" }, t)).toBeNull();
  });
});

describe("kbChangeMonths", () => {
  it("groups by month, newest first, with a capitalised month name", () => {
    const months = kbChangeMonths(
      [
        { ...sp29, listed_on: "2026-10-22", event: "cancelled" },
        { ...sp29, event: "amendment_approved", amendment_no: 5 },
        { ...sp29, listed_on: "2026-11-03", event: "document_added" },
        { ...sp29, event: "mystery" },
      ],
      t,
      "ru",
    );
    expect(months.map((m) => [m.label, m.entries.map((e) => e.date)])).toEqual([
      ["Ноябрь 2026", ["10.11.2026", "03.11.2026"]],
      ["Октябрь 2026", ["22.10.2026"]],
    ]);
  });

  it("is empty for an empty feed", () => {
    expect(kbChangeMonths([], t, "ru")).toEqual([]);
  });
});

describe("kbChangesMonthLine (the tile, frame 1)", () => {
  it("names the current month and its number, nothing when there were none", () => {
    expect(kbChangesMonthLine(3, t, "ru", "2026-11-06")).toBe("За ноябрь: 3");
    expect(kbChangesMonthLine(0, t, "ru", "2026-11-06")).toBeNull();
    expect(kbMonthLabel("2026-01-15", "ru")).toBe("Январь 2026");
  });
});
