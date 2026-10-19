import { describe, expect, it, vi } from "vitest";
import i18n from "@/i18n";
import {
  SHURIK_HINT_KEYS,
  resolveShurikHintAction,
  shurikGreeting,
  shurikGreetingName,
  shurikGreetingSlot,
  shurikHintTextValues,
  shurikHintTodayHref,
  profileFullName,
} from "@/lib/shurik-hints";
import ruLocale from "@/locales/ru.json";
import enLocale from "@/locales/en.json";

vi.mock("@/data/messenger-links", () => ({ TELEGRAM_BOT_USERNAME: "rovno_test_bot" }));

const ru = ruLocale as Record<string, string>;
const en = enLocale as Record<string, string>;

const FIRST_RELEASE = Array.from({ length: 40 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`).filter(
  (key) => key !== "T05" && key !== "T21",
);

// What shurik_hint_candidates_t41_t84() and shurik_hint_candidates_k_n() of rovno-db emit (8.4, 8.5).
const SECOND_PART = [
  "T41", "T42", "T43", "T44", "T47", "T48", "T50", "T51", "T52", "T53", "T55", "T56",
  "T60", "T61", "T62", "T63", "T64", "T67", "T69", "T71", "T72", "T73", "T82", "T83", "T84",
  "K01", "K02", "K03", "K04", "K05", "K06", "K09", "K10", "K11",
  "N01", "N02", "N03", "N04", "N05", "N06",
];
// What shurik_hint_candidates_s8_more() of rovno-db adds (8.6, 8.11); T12, T14 and T28 are already
// in the first release. T81 is not built on the server either: the app has no place to add people
// to an existing organization.
const THIRD_PART = ["T45", "T46", "T49", "T54", "T57", "T58", "T59", "T66", "K07", "K08", "T79", "T80"];
const ALL_HINTS = [...FIRST_RELEASE, ...SECOND_PART, ...THIRD_PART];

describe("the address of the hint sent to Telegram", () => {
  it("leads to the project chat, where the card of the day stands", () => {
    expect(shurikHintTodayHref("p1")).toBe("/project/p1/dashboard?hint=today");
  });
});

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

  it("knows the hints the database can pick (and T10, not built yet), each with words in both languages", () => {
    expect([...SHURIK_HINT_KEYS].sort()).toEqual([...ALL_HINTS].sort());
    expect(SHURIK_HINT_KEYS).not.toContain("T81");
    for (const key of [...SECOND_PART, ...THIRD_PART]) {
      expect(resolveShurikHintAction({ hint_key: key, params: {} }, "p1"), key).not.toBeNull();
      for (const locale of [ru, en]) {
        expect(locale[`shurikHints.${key}.text`], `${key}.text`).toBeTruthy();
        expect(locale[`shurikHints.${key}.button`], `${key}.button`).toBeTruthy();
      }
    }
  });

  it("leads the second part's buttons to their pages", () => {
    const href = (key: string) => {
      const action = resolveShurikHintAction({ hint_key: key, params: {} }, "p1");
      return action?.kind === "navigate" ? action.href : action?.kind;
    };
    expect(href("T41")).toBe("/project/p1/hr");
    expect(href("T47")).toBe("/project/p1/participants");
    expect(href("T52")).toBe("/project/p1/dashboard?report=client");
    expect(href("T84")).toBe("/project/p1/dashboard?report=client");
    expect(href("T56")).toBe("/project/p1/documents");
    expect(href("T63")).toBe("/project/p1/gallery");
    expect(href("T67")).toBe("/settings?tab=notifications");
    expect(href("T71")).toBe("/settings?tab=profile");
    expect(href("K01")).toBe("/project/p1/estimate");
    expect(href("K05")).toBe("/project/p1/tasks");
    expect(href("K09")).toBe("/project/p1/dashboard");
    expect(href("K11")).toBe("/home");
    expect(href("N05")).toBe("/project/p1/procurement");
    expect(href("T83")).toBe("ask");
  });

  it("leads the third part's buttons to their pages, and Telegram hints to the bot", () => {
    const href = (key: string) => {
      const action = resolveShurikHintAction({ hint_key: key, params: {} }, "p1");
      return action && action.kind !== "ask" ? `${action.kind} ${action.href}` : action?.kind;
    };
    for (const key of ["T45", "T46", "T49"]) expect(href(key), key).toBe("navigate /project/p1/participants");
    for (const key of ["T54", "T57", "T58", "T59"]) expect(href(key), key).toBe("navigate /project/p1/dashboard?report=client");
    expect(href("T66")).toBe("navigate /settings?tab=notifications");
    expect(href("T79")).toBe("navigate /home");
    expect(href("T80")).toBe("navigate /home?tab=documents&docTab=document-templates");
    expect(href("K07")).toBe("external https://t.me/rovno_test_bot");
    expect(href("K08")).toBe("external https://t.me/rovno_test_bot");
    expect(href("T81")).toBeUndefined();
  });

  it("quotes the real labels of the screens the third part's texts name", () => {
    expect(ru["shurikHints.T54.text"]).toContain(`«${ru["clientReport.rhythm.label"]}»`);
    expect(ru["shurikHints.T54.text"]).toContain(`«${ru["clientReport.rhythm.weekly"]}»`);
    expect(en["shurikHints.T54.text"]).toContain(`“${en["clientReport.rhythm.label"]}”`);
    expect(en["shurikHints.T54.text"]).toContain(`“${en["clientReport.rhythm.weekly"]}”`);
    expect(ru["shurikHints.T57.text"]).toContain(`«${ru["documents.share.copyLink"]}»`);
    expect(en["shurikHints.T57.text"]).toContain(`“${en["documents.share.copyLink"]}”`);
    expect(ru["shurikHints.T58.text"]).toContain(`«${ru["clientReport.downloadPdf"]}»`);
    expect(en["shurikHints.T58.text"]).toContain(`“${en["clientReport.downloadPdf"]}”`);
    expect(ru["shurikHints.T66.text"]).toContain(`«${ru["notifications.delivery.title"]}»`);
    expect(en["shurikHints.T66.text"]).toContain(`“${en["notifications.delivery.title"]}”`);
  });

  it("says «Установи», never «Поставь»", () => {
    for (const key of ALL_HINTS) {
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

describe("second part texts", () => {
  const ruT = i18n.getFixedT("ru");

  it("names the one item from params", () => {
    expect(ruT("shurikHints.T42.text", shurikHintTextValues({ hr_item_id: "h1", hr_item_title: "Электрика, кухня" }, "ru"))).toBe(
      "По подряду «Электрика, кухня» записана только часть суммы. Когда рассчитаешься полностью, добавь остаток, и статус станет «Оплачено».",
    );
    expect(ruT("shurikHints.T47.text", shurikHintTextValues({ invite_id: "i1", email: "ivan@example.ru" }, "ru"))).toContain(
      "Приглашение для ivan@example.ru ждёт ответа",
    );
  });

  it("counts the tasks left in the right form", () => {
    const text = (left: number) => ruT("shurikHints.T83.text", shurikHintTextValues({ tasks_left: left, tasks_total: 12 }, "ru"));
    expect(text(3)).toContain("осталось 3 задачи из 12");
    expect(text(5)).toContain("осталось 5 задач из 12");
    expect(text(21)).toContain("осталась 21 задача из 12");
  });

  it("speaks of a photo without quoting an empty caption", () => {
    for (const caption of [null, ""]) {
      const text = ruT("shurikHints.T63.text", shurikHintTextValues({ media_id: "m1", caption }, "ru"));
      expect(text).toBe("Одно из фото не привязано к задаче. Привяжи его, и в задаче будет видно, как продвигалась работа.");
    }
    expect(ruT("shurikHints.T64.text", shurikHintTextValues({ media_id: "m1", caption: "Кухня, северная стена" }, "ru"))).toBe(
      "Фото «Кухня, северная стена» внутреннее, клиент его не увидит. Если хочешь показать ход работ, открой его.",
    );
  });

  it("names the executor of T46, and speaks of «an executor» when the profile has no name", () => {
    expect(ruT("shurikHints.T46.text", shurikHintTextValues({ member_profile_id: "u1", member_name: "Иван, электрик" }, "ru"))).toBe(
      "В смете назван исполнитель «Иван, электрик», но в проекте его ещё нет. Пригласи его, и задачи придут прямо к нему.",
    );
    for (const member_name of [null, ""]) {
      const text = ruT("shurikHints.T46.text", shurikHintTextValues({ member_profile_id: "u1", member_name }, "ru"));
      expect(text).toBe("В смете назван исполнитель, которого ещё нет в проекте. Пригласи его, и задачи придут прямо к нему.");
    }
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
