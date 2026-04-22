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

export default i18n;
