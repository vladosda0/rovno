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
  // The hint quotes the permission label «Шурик (ИИ-помощник)» the person has to find.
  "shurikHints.T51.text",
];

describe("the assistant is called Shurik", () => {
  it.each(NAME_KEYS)("%s is the name alone", (key) => {
    expect(ru[key]).toBe("Шурик");
    expect(en[key]).toBe("Shurik");
  });

  it("introduces himself by name in the fallback answer", () => {
    // The three-day «Шурик, твой помощник по стройке» over the empty chat went with slice 8.
    expect(ru["ai.sidebar.opener.l0.headline"]).toBeUndefined();
    expect(ru["ai.sidebar.message.fallbackIntro"]).toMatch(/^Я Шурик, твой помощник по стройке\. /);
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

describe("no stray word names Shurik: «ассистент», assistant, AI", () => {
  it("has no «ассистент» left in the Russian texts", () => {
    const stray = Object.entries(ru)
      .filter(([, value]) => /ассистент/i.test(value))
      .map(([key]) => key);
    expect(stray).toEqual([]);
  });

  it("says assistant in English only where it is his job title", () => {
    const jobTitle = Object.entries(en)
      .filter(([, value]) => /assistant/i.test(value))
      .map(([key]) => key);
    expect(jobTitle.sort()).toEqual(
      [...JOB_TITLE_KEYS, "ai.sidebar.message.fallbackIntro"].sort(),
    );
  });

  it("does not call him AI where the panel explains a missing permission", () => {
    expect(en["ai.sidebar.liveAssistant.permissionsUnavailable"]).toBe(
      "Shurik can't use this project context right now (permissions unavailable).",
    );
  });
});

/** Keys where «ИИ» / AI used to stand for Shurik himself: the one who answers, suggests, is asked. */
const HE_IS_NAMED_KEYS = [
  "onboarding.automation.subtitle",
  "onboarding.automation.full.desc",
  "onboarding.automation.assisted.title",
  "onboarding.automation.assisted.desc",
  "onboarding.automation.manual.desc",
  "onboarding.automation.observer.desc",
  "nav.toggleAiSidebar",
  "home.documentsHub.leaves.myNotes.subtitle",
  "home.documentsHub.leaves.myNotes.emptyBody",
  "projectDashboard.automation.assisted",
  "quickActions.document.aiScanTooltip",
  "quickActions.document.createWithAi",
  "quickActions.document.createWithAiTooltip",
  "quickActions.document.unavailableSupabaseDescription",
  "preferences.aiLanguage",
  "preferences.automation.lowDesc",
  "preferences.automation.balancedDesc",
  "preferences.automation.highDesc",
  "ai.sidebar.automation.assisted.label",
  "ai.sidebar.automation.assisted.description",
  "ai.sidebar.liveAssistant.noProjectData",
  "ai.sidebar.toast.estimateUnavailable.description",
  "ai.sidebar.toast.procurementUnavailable.description",
  "ai.sidebar.toast.copy.description",
  "ai.sidebar.saveDialog.description",
  "ai.sidebar.learnNote.defaultTitle",
  "ai.sidebar.toast.aiBusy.title",
  "ai.sidebar.proposal.executedTitle",
  "ai.sidebar.proposal.demo.taskDescription",
  "ai.sidebar.proposal.demo.documentDraftBody",
  "ai.sidebar.proposal.statusTitle.failed",
  "ai.sidebar.proposal.statusTitle.declined",
  "ai.sidebar.filter.aiActions",
  "ai.sidebar.composer.placeholderDefault",
  "ai.sidebar.composer.placeholderLearn",
  "ai.sidebar.consult.actions.addComment",
  "ai.sidebar.consult.analysisCommentPrefix",
  "ai.sidebar.guest.loginHint",
  "ai.sidebar.guest.loginCta",
  "ai.sidebar.openAria",
  "photoViewer.aiConsult",
  "tutorial.media.step1.aiHint",
  "tasks.newStageModal.createWithAi",
  "documents.empty.descriptionLocal",
  "documents.generate.description",
  "documents.generate.unavailableDescription",
  "documents.generate.bodyTemplate",
];

/** Keys that keep «ИИ» / AI: the technology, a plan line, a permission, or landing copy. */
const TECHNOLOGY_KEYS = [
  "tutorial.media.step1.description",
  "projectsTab.aiUnavailable.title",
  "projectsTab.aiUnavailable.other",
  "projectsTab.aiHint.supabase",
  "projectsTab.aiHint.other",
  "financeTab.aiExperimental",
  "projectDashboard.aiDescription",
  "projectDashboard.aiDescriptionPlaceholder",
  "quickActions.document.aiScan",
  "settingsNav.project.autopilot",
  "preferences.ai.title",
  "preferences.ai.description",
  "privacy.ai.title",
  "privacy.ai.description",
  "privacy.ai.helper",
  "billing.description",
  "plans.dialog.limit.chat_one",
  "plans.dialog.limit.chat_few",
  "plans.dialog.limit.chat_many",
  "plans.dialog.limit.chat_other",
  "quota.meter.chat",
  "quota.warning.chat",
  "quota.gate.chat.title",
  "quota.gate.chat.body",
  "participants.table.aiAccess",
  "participants.permission.aiAccess",
  "participants.aiAccess.none",
  "participants.summary.ai",
  "participants.warning.aiProjectPool",
  "ai.sidebar.toast.accessDenied.generationDescription",
  "ai.sidebar.toast.accessDenied.photoConsultDescription",
  "ai.sidebar.toast.supabaseModeUnavailable.documentDescription",
  "landing.meta.title",
  "landing.meta.description",
  "landing.usecases.company.desc",
  "landing.features.chat.pill",
  "landing.pricing.master.feat1",
  "landing.pricing.brigade.feat1",
  "landing.faq.a1",
  "landing.faq.q4",
  "landing.finalCta.subtitle",
  "landing.footer.tagline",
  "pricing.plans.free.ai.title",
  "pricing.plans.free.ai.chat",
  "pricing.plans.master.ai.title",
  "pricing.plans.master.ai.chat",
  "pricing.plans.master.telegram",
  "pricing.plans.brigade.ai.title",
  "pricing.plans.brigade.ai.chat",
  "pricing.plans.brigade.telegram",
  "pricing.allIncluded.f2",
  "participants.drawer.axis.ai",
  "participants.preview.ai",
  "participants.axisHelp.ai.none",
  "participants.axisHelp.ai.consult_only",
  "participants.axisHelp.ai.project_pool",
  "shurikHints.T51.text",
];

/** English labels of the assisted mode that had no AI in them to begin with. */
const EN_NEVER_NAMED_ANYONE = ["projectDashboard.automation.assisted", "ai.sidebar.automation.assisted.label"];

describe("«ИИ» and AI do not stand in for his name", () => {
  it.each(HE_IS_NAMED_KEYS)("%s names Shurik", (key) => {
    expect(ru[key]).toMatch(/Шурик/);
    expect(ru[key]).not.toMatch(/ИИ|\bAI\b/);
    expect(en[key]).not.toMatch(/\bAI\b/);
    if (!EN_NEVER_NAMED_ANYONE.includes(key)) {
      expect(en[key]).toMatch(/Shurik/);
    }
  });

  it("keeps «ИИ» and AI only in the listed technology, plan, permission and landing keys", () => {
    const left = new Set([
      ...Object.entries(ru).filter(([, value]) => /ИИ|\bAI\b/.test(value)).map(([key]) => key),
      ...Object.entries(en).filter(([, value]) => /\bAI\b/.test(value)).map(([key]) => key),
    ]);
    expect([...left].sort()).toEqual([...TECHNOLOGY_KEYS].sort());
  });
});

describe("text Shurik writes into a task made from a photo", () => {
  it("comes from the locales and names him", () => {
    expect(ru["ai.sidebar.consult.taskDescription"]).toMatch(/Шурик.*\{\{caption\}\}/);
    expect(en["ai.sidebar.consult.taskDescription"]).toMatch(/Shurik.*\{\{caption\}\}/);
  });
});
