import { describe, expect, it } from "vitest";
import i18next from "i18next";
import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";

// SubscriptionSection formats the period end with these options and passes it as
// {{date}}; in ru-RU the result already ends in "г.".
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
const KEYS = ["settings.billing.autoRenewOffNote", "settings.billing.graceNote"] as const;

async function render(lng: "ru" | "en", key: string) {
  const i18n = i18next.createInstance();
  await i18n.init({
    lng,
    resources: { ru: { translation: ruLocale }, en: { translation: enLocale } },
    keySeparator: false,
    interpolation: { escapeValue: false },
  });
  const date = new Intl.DateTimeFormat(lng === "ru" ? "ru-RU" : "en-US", DATE_OPTIONS).format(
    new Date("2027-07-18T12:00:00Z"),
  );
  return i18n.t(key, { date });
}

describe("billing notes with a date", () => {
  for (const lng of ["ru", "en"] as const) {
    for (const key of KEYS) {
      it(`${lng} ${key} has no double period`, async () => {
        const text = await render(lng, key);
        expect(text).toContain("2027");
        expect(text).not.toContain("..");
      });
    }
  }
});
