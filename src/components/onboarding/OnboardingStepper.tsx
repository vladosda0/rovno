import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Bot, Wrench, Eye } from "lucide-react";
import { MVP_SHOW_AI_AUTOMATION_MODE_UI } from "@/lib/mvp-ai-automation-ui";

const automationLevels = [
  { id: "full", icon: Zap, titleKey: "onboarding.automation.full.title", descKey: "onboarding.automation.full.desc", badgeKey: "onboarding.automation.full.badge" },
  { id: "assisted", icon: Bot, titleKey: "onboarding.automation.assisted.title", descKey: "onboarding.automation.assisted.desc", badgeKey: null },
  { id: "manual", icon: Wrench, titleKey: "onboarding.automation.manual.title", descKey: "onboarding.automation.manual.desc", badgeKey: null },
  { id: "observer", icon: Eye, titleKey: "onboarding.automation.observer.title", descKey: "onboarding.automation.observer.desc", badgeKey: null },
] as const;

interface OnboardingStepperProps {
  onComplete: () => void;
}

export function OnboardingStepper({ onComplete }: OnboardingStepperProps) {
  const { t } = useTranslation();
  const showAutomationStep = MVP_SHOW_AI_AUTOMATION_MODE_UI;
  const [step, setStep] = useState(showAutomationStep ? 0 : 1);
  const [selectedLevel, setSelectedLevel] = useState("manual");
  const [language, setLanguage] = useState("ru");
  const [units, setUnits] = useState("metric");

  const progressIndices = showAutomationStep ? [0, 1] : [0];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-sp-4">
      {/* Progress */}
      <div className="flex items-center gap-2 justify-center">
        {progressIndices.map((i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              (showAutomationStep ? step : step - 1) >= i ? "w-12 bg-accent" : "w-8 bg-muted"
            }`}
          />
        ))}
      </div>

      {showAutomationStep && step === 0 && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">{t("onboarding.automation.title")}</h2>
            <p className="text-body-sm text-muted-foreground mt-1">
              {t("onboarding.automation.subtitle")}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-sp-2">
            {automationLevels.map((level) => {
              const isSelected = selectedLevel === level.id;
              return (
                <button
                  key={level.id}
                  onClick={() => setSelectedLevel(level.id)}
                  className={`glass rounded-card p-sp-3 text-left transition-all relative ${
                    isSelected ? "ring-2 ring-accent" : "hover:bg-accent/5"
                  }`}
                >
                  {level.badgeKey && (
                    <span className="absolute -top-2 right-3 inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-medium bg-accent text-accent-foreground">
                      {t(level.badgeKey)}
                    </span>
                  )}
                  <level.icon className={`h-5 w-5 mb-sp-1 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                  <h3 className="text-body-sm font-semibold text-foreground">{t(level.titleKey)}</h3>
                  <p className="text-caption text-muted-foreground mt-0.5">{t(level.descKey)}</p>
                </button>
              );
            })}
          </div>
          <Button
            onClick={() => setStep(1)}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("onboarding.continue")}
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">{t("onboarding.preferences.title")}</h2>
            <p className="text-body-sm text-muted-foreground mt-1">{t("onboarding.preferences.subtitle")}</p>
          </div>
          <div className="space-y-sp-2">
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">{t("onboarding.preferences.languageLabel")}</label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ru">Русский</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">{t("onboarding.preferences.unitsLabel")}</label>
              <Select value={units} onValueChange={setUnits}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="metric">{t("onboarding.preferences.metric")}</SelectItem>
                  <SelectItem value="imperial">{t("onboarding.preferences.imperial")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-sp-2">
            {showAutomationStep ? (
              <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                {t("onboarding.back")}
              </Button>
            ) : null}
            <Button
              onClick={onComplete}
              className={showAutomationStep ? "flex-1 bg-accent text-accent-foreground hover:bg-accent/90" : "w-full bg-accent text-accent-foreground hover:bg-accent/90"}
            >
              {t("onboarding.complete")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
