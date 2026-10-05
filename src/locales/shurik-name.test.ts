import { describe, expect, it } from "vitest";
import enLocale from "@/locales/en.json";
import ruLocale from "@/locales/ru.json";

const ru = ruLocale as Record<string, string>;
const en = enLocale as Record<string, string>;

/** Keys where the assistant is named as the author or the place: the name alone. */
const NAME_KEYS = [
  "ai.shurik.name",
  "ai.sidebar.chat.ai",
  "ai.event.actorAI",
  "projectTabs.ai",
  "tutorial.aiSidebar.step1.title",
];

/** Keys that keep the job title, because they explain what the assistant is. */
const JOB_TITLE_KEYS = [
  "preferences.ai.description",
  "participants.drawer.axis.ai",
  "participants.preview.ai",
  "participants.axisHelp.ai.none",
  "pricing.allIncluded.f2",
];

describe("the assistant is called Shurik", () => {
  it.each(NAME_KEYS)("%s is the name alone", (key) => {
    expect(ru[key]).toBe("Шурик");
    expect(en[key]).toBe("Shurik");
  });

  it("introduces himself by name in the empty panel", () => {
    expect(ru["ai.sidebar.opener.l0.headline"]).toBe("Шурик, твой помощник по стройке");
    expect(ru["ai.sidebar.message.fallbackIntro"]).toMatch(/^Я Шурик, твой помощник по стройке\. /);
    expect(en["ai.sidebar.opener.l0.headline"]).toBe("Shurik, your construction assistant");
    expect(en["ai.sidebar.message.fallbackIntro"]).toMatch(/^I'm Shurik, your construction assistant\. /);
  });

  it("names him where the panel is closed to a guest", () => {
    expect(ru["ai.sidebar.guest.locked"]).toBe("Шурик недоступен");
    expect(en["ai.sidebar.guest.locked"]).toBe("Shurik is unavailable");
  });

  it("keeps the job title next to the name in settings and participant rights", () => {
    expect(ru["preferences.ai.description"]).toBe("Управляй поведением Шурика, твоего ИИ-помощника.");
    expect(ru["participants.drawer.axis.ai"]).toBe("Шурик (ИИ-помощник)");
    expect(ru["participants.preview.ai"]).toBe("Шурик (ИИ-помощник)");
    expect(en["preferences.ai.description"]).toBe("Control how Shurik, your AI assistant, behaves.");
    expect(en["participants.drawer.axis.ai"]).toBe("Shurik (AI assistant)");
    expect(en["participants.preview.ai"]).toBe("Shurik (AI assistant)");
  });

  it("leaves the pricing page line as it was", () => {
    expect(ru["pricing.allIncluded.f2"]).toBe("ИИ-помощник со знанием строительных норм и ГОСТов");
  });

  it("has no ИИ-ассистент or AI-ассистент left, and ИИ-помощник only in the listed keys", () => {
    const stray = Object.entries(ru).filter(([, value]) => /ИИ-ассистент|AI-ассистент/.test(value));
    expect(stray).toEqual([]);

    const jobTitle = Object.entries(ru)
      .filter(([, value]) => value.includes("ИИ-помощник"))
      .map(([key]) => key);
    expect(jobTitle.sort()).toEqual([...JOB_TITLE_KEYS].sort());
  });
});
