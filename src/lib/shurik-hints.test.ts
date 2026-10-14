import { describe, expect, it } from "vitest";
import {
  resolveShurikHintAction,
  shurikGreeting,
  shurikGreetingName,
  shurikGreetingSlot,
  shurikHintTextValues,
  profileFullName,
} from "@/lib/shurik-hints";
import ruLocale from "@/locales/ru.json";
import enLocale from "@/locales/en.json";

const ru = ruLocale as Record<string, string>;
const en = enLocale as Record<string, string>;

const FIRST_RELEASE = Array.from({ length: 40 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`).filter(
  (key) => key !== "T05" && key !== "T21",
);

describe("button address by hint key", () => {
  it("opens the task named in params", () => {
    expect(resolveShurikHintAction({ hint_key: "T20", params: { task_id: "t-1", task_title: "Штукатурка" } }, "p1")).toEqual({
      kind: "navigate",
      href: "/project/p1/tasks?task=t-1",
    });
  });

  it("opens the procurement item and the order named in params", () => {
    expect(resolveShurikHintAction({ hint_key: "T32", params: { item_id: "i-9" } }, "p1")).toEqual({
      kind: "navigate",
      href: "/project/p1/procurement/i-9",
    });
    expect(resolveShurikHintAction({ hint_key: "T35", params: { order_id: "o-2" } }, "p1")).toEqual({
      kind: "navigate",
      href: "/project/p1/procurement/order/o-2",
    });
  });

  it("falls back to the section when the id is missing", () => {
    expect(resolveShurikHintAction({ hint_key: "T19", params: {} }, "p1")).toEqual({ kind: "navigate", href: "/project/p1/tasks" });
    expect(resolveShurikHintAction({ hint_key: "T31", params: {} }, "p1")).toEqual({ kind: "navigate", href: "/project/p1/procurement" });
  });

  it("leads estimate hints to the estimate and catalogue hints home", () => {
    expect(resolveShurikHintAction({ hint_key: "T01", params: {} }, "p1")).toEqual({ kind: "navigate", href: "/project/p1/estimate" });
    expect(resolveShurikHintAction({ hint_key: "T17", params: {} }, "p1")).toEqual({
      kind: "navigate",
      href: "/home?tab=documents&docTab=catalogs",
    });
  });

  it("puts a question into the composer for an «ask Shurik» hint instead of opening a page", () => {
    expect(resolveShurikHintAction({ hint_key: "T82", params: {} }, "p1")).toEqual({
      kind: "ask",
      questionKey: "ai.sidebar.suggestion.whatBlocksTasks",
    });
  });

  it("knows nothing about T05, T21 or an unknown key, so no card can be drawn for them", () => {
    for (const key of ["T05", "T21", "Z99"]) {
      expect(resolveShurikHintAction({ hint_key: key, params: {} }, "p1")).toBeNull();
    }
  });

  it("has a text and a button in both languages for every hint of the first release", () => {
    for (const key of FIRST_RELEASE) {
      expect(resolveShurikHintAction({ hint_key: key, params: {} }, "p1")).not.toBeNull();
      for (const locale of [ru, en]) {
        expect(locale[`shurikHints.${key}.text`], `${key}.text`).toBeTruthy();
        expect(locale[`shurikHints.${key}.button`], `${key}.button`).toBeTruthy();
      }
    }
    expect(ru["shurikHints.T05.text"]).toBeUndefined();
    expect(ru["shurikHints.T21.text"]).toBeUndefined();
  });

  it("says «Установи», never «Поставь»", () => {
    for (const key of FIRST_RELEASE) {
      expect(ru[`shurikHints.${key}.text`]).not.toMatch(/Поставь/);
      expect(ru[`shurikHints.${key}.button`]).not.toMatch(/Поставить/);
    }
  });
});

describe("text values", () => {
  it("reads a server day as a day of the month", () => {
    expect(shurikHintTextValues({ order_by: "2026-10-21", item_title: "Плитка" }, "ru")).toMatchObject({
      order_by: "21 октября",
      item_title: "Плитка",
    });
  });

  it("lets the number of days choose the plural form", () => {
    expect(shurikHintTextValues({ days: 3 }, "ru")).toMatchObject({ days: 3, count: 3 });
  });
});

describe("greeting in the composer", () => {
  const at = (iso: string) => new Date(iso);
  const t = (key: string, options?: Record<string, unknown>) =>
    (ru[key] ?? key).replace("{{name}}", String(options?.name ?? ""));

  it("follows the time of day", () => {
    // 2026-10-15 is a Thursday.
    expect(shurikGreetingSlot(at("2026-10-15T06:00:00"))).toBe("earlyMorning");
    expect(shurikGreetingSlot(at("2026-10-15T09:00:00"))).toBe("morning");
    expect(shurikGreetingSlot(at("2026-10-15T13:00:00"))).toBe("day");
    expect(shurikGreetingSlot(at("2026-10-15T18:00:00"))).toBe("evening");
    expect(shurikGreetingSlot(at("2026-10-15T23:30:00"))).toBe("night");
    expect(shurikGreetingSlot(at("2026-10-15T03:00:00"))).toBe("night");
  });

  it("has its own words on Monday morning and at the weekend, but not at night", () => {
    expect(shurikGreetingSlot(at("2026-10-19T09:00:00"))).toBe("monday");
    expect(shurikGreetingSlot(at("2026-10-19T14:00:00"))).toBe("day");
    expect(shurikGreetingSlot(at("2026-10-17T11:00:00"))).toBe("weekend");
    expect(shurikGreetingSlot(at("2026-10-17T23:00:00"))).toBe("night");
  });

  it("takes the first word of the full name, and greets without one when the profile has none", () => {
    expect(shurikGreetingName("  Влад Горлов ")).toBe("Влад");
    expect(shurikGreetingName("")).toBeNull();
    expect(shurikGreeting(t, at("2026-10-15T09:00:00"), "Влад Горлов")).toBe("Доброе утро, Влад. Хорошего рабочего дня!");
    expect(shurikGreeting(t, at("2026-10-15T09:00:00"), null)).toBe("Доброе утро. Хорошего рабочего дня!");
    expect(shurikGreeting(t, at("2026-10-15T23:00:00"), "Влад")).toBe("Влад, ты ещё работаешь? Тогда я рядом.");
  });

  it("greets without a name when the profile has no full name and the app fell back to the email", () => {
    const user = { name: "vlad@rovno.ai", email: "vlad@rovno.ai" };
    expect(profileFullName(user)).toBeNull();
    expect(profileFullName({ name: "Unknown user", email: null })).toBeNull();
    expect(profileFullName({ name: "", email: "a@b.c" })).toBeNull();
    expect(profileFullName({ name: "Влад Горлов", email: "vlad@rovno.ai" })).toBe("Влад Горлов");
    expect(shurikGreetingName("vlad@rovno.ai")).toBeNull();
    expect(shurikGreeting(t, at("2026-10-15T09:00:00"), profileFullName(user))).toBe("Доброе утро. Хорошего рабочего дня!");
  });
});
