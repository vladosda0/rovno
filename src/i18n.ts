import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "@/locales/ru.json";
import en from "@/locales/en.json";

const STORAGE_KEY = "app-language";

export type AppLanguage = "ru" | "en";

export function getStoredLanguage(): AppLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en" ? "en" : "ru";
}

export function setStoredLanguage(lang: AppLanguage): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

/** Coerce any stored/profile locale to a supported UI language. */
export function toAppLanguage(locale: string | null | undefined): AppLanguage {
  return locale === "ru" ? "ru" : locale === "en" ? "en" : "en";
}

/**
 * Apply a language everywhere in one call: switch i18n live AND persist it for the
 * next boot. Use this from every language switcher so the UI, localStorage, and
 * subsequent reloads stay consistent.
 */
export function setAppLanguage(lang: AppLanguage): void {
  setStoredLanguage(lang);
  void i18n.changeLanguage(lang);
}

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// Keep <html lang> in sync with the active UI language. The static index.html
// hardcodes lang="en"; without this it never reflects the real language (a11y /
// screen-reader correctness). Set on boot and on every change.
function syncHtmlLang(lng: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lng;
  }
}
syncHtmlLang(i18n.language);
i18n.on("languageChanged", syncHtmlLang);

export default i18n;
