import { useState, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Bot, Wrench, Eye } from "lucide-react";
import { MVP_SHOW_AI_AUTOMATION_MODE_UI } from "@/lib/mvp-ai-automation-ui";
import { getPlanningSource } from "@/data/planning-source";
import { getWorkspaceSource, resolveWorkspaceMode } from "@/data/workspace-source";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import { toast } from "@/hooks/use-toast";

const automationLevels = [
  { id: "full", icon: Zap, titleKey: "onboarding.automation.full.title", descKey: "onboarding.automation.full.desc", badgeKey: "onboarding.automation.full.badge" },
  { id: "assisted", icon: Bot, titleKey: "onboarding.automation.assisted.title", descKey: "onboarding.automation.assisted.desc", badgeKey: null },
  { id: "manual", icon: Wrench, titleKey: "onboarding.automation.manual.title", descKey: "onboarding.automation.manual.desc", badgeKey: null },
  { id: "observer", icon: Eye, titleKey: "onboarding.automation.observer.title", descKey: "onboarding.automation.observer.desc", badgeKey: null },
] as const;

interface OnboardingStepperProps {
  onComplete: () => void;
  onProjectCreated?: (projectId: string) => void;
}

export function OnboardingStepper({ onComplete, onProjectCreated }: OnboardingStepperProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const workspaceMode = useWorkspaceMode();
  const showAutomationStep = MVP_SHOW_AI_AUTOMATION_MODE_UI;
  const [step, setStep] = useState(showAutomationStep ? 0 : 1);
  const [selectedLevel, setSelectedLevel] = useState("manual");
  const [language, setLanguage] = useState("ru");
  const [units, setUnits] = useState("metric");

  const [projectTitle, setProjectTitle] = useState("");
  const [projectType, setProjectType] = useState("residential");
  const [creatingProject, setCreatingProject] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const [estimateTitle, setEstimateTitle] = useState("");

  const progressIndices = showAutomationStep ? [0, 1, 2, 3] : [1, 2, 3];

  async function handleCreateProject(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (creatingProject) return;

    const title = projectTitle.trim() || t("projectsTab.untitledProject");
    setCreatingProject(true);

    try {
      const resolvedMode = workspaceMode.kind === "pending-supabase"
        ? await resolveWorkspaceMode()
        : workspaceMode;
      const workspaceSource = await getWorkspaceSource(resolvedMode);
      const planningSource = await getPlanningSource(resolvedMode);
      const createdProject = await workspaceSource.createProject({
        title,
        type: projectType,
        projectMode: "contractor",
      });

      await planningSource.createProjectStage({
        projectId: createdProject.id,
        title: t("projectsTab.stage1"),
        description: "",
        order: 1,
        status: "open",
      });

      if (resolvedMode.kind === "supabase") {
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.projects(resolvedMode.profileId),
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.project(resolvedMode.profileId, createdProject.id),
        });
        await queryClient.invalidateQueries({
          queryKey: workspaceQueryKeys.projectMembers(resolvedMode.profileId, createdProject.id),
        });
        await queryClient.invalidateQueries({
          queryKey: planningQueryKeys.projectStages(resolvedMode.profileId, createdProject.id),
        });
      }

      setCreatedProjectId(createdProject.id);
      onProjectCreated?.(createdProject.id);
      setStep(3);
    } catch (error) {
      toast({
        title: t("projectsTab.projectCreationFailed"),
        description: error instanceof Error ? error.message : t("projectsTab.projectCreationFailedGeneric"),
        variant: "destructive",
      });
    } finally {
      setCreatingProject(false);
    }
  }

  function handleSkipProject() {
    setStep(3);
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-sp-4">
      {/* Progress */}
      <div className="flex items-center gap-2 justify-center">
        {progressIndices.map((i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              step >= i ? "w-12 bg-accent" : "w-8 bg-muted"
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
              onClick={() => setStep(2)}
              className={showAutomationStep ? "flex-1 bg-accent text-accent-foreground hover:bg-accent/90" : "w-full bg-accent text-accent-foreground hover:bg-accent/90"}
            >
              {t("onboarding.continue")}
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">{t("onboarding.project.title")}</h2>
            <p className="text-body-sm text-muted-foreground mt-1">{t("onboarding.project.subtitle")}</p>
          </div>
          <div className="space-y-sp-2">
            <div className="space-y-1.5">
              <Input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder={t("onboarding.project.namePlaceholder")}
                autoFocus
                disabled={creatingProject}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-body-sm font-medium text-foreground">{t("onboarding.project.typeLabel")}</label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                disabled={creatingProject}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="residential">{t("projectsTab.type.residential")}</option>
                <option value="commercial">{t("projectsTab.type.commercial")}</option>
                <option value="industrial">{t("projectsTab.type.industrial")}</option>
              </select>
            </div>
          </div>
          <Button
            onClick={handleCreateProject}
            disabled={creatingProject}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {creatingProject ? t("onboarding.project.creating") : t("onboarding.project.createAndContinue")}
          </Button>
          <button
            type="button"
            onClick={handleSkipProject}
            disabled={creatingProject}
            className="w-full text-center text-body-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("onboarding.project.skip")}
          </button>
        </div>
      )}

      {step === 3 && !createdProjectId && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3 text-center">
          <h2 className="text-h3 text-foreground">{t("onboarding.done.title")}</h2>
          <p className="text-body-sm text-muted-foreground">{t("onboarding.done.subtitle")}</p>
          <Button
            onClick={onComplete}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("onboarding.done.goToApp")}
          </Button>
        </div>
      )}

      {step === 3 && createdProjectId && (
        <div className="glass-elevated rounded-panel p-sp-4 space-y-sp-3">
          <div className="text-center">
            <h2 className="text-h3 text-foreground">{t("onboarding.estimate.title")}</h2>
            <p className="text-body-sm text-muted-foreground mt-1">{t("onboarding.estimate.subtitle")}</p>
          </div>
          <div className="space-y-1.5">
            <Input
              value={estimateTitle}
              onChange={(e) => setEstimateTitle(e.target.value)}
              placeholder={t("onboarding.estimate.namePlaceholder")}
              autoFocus
            />
          </div>
          <Button
            onClick={onComplete}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {t("onboarding.estimate.create")}
          </Button>
          <button
            type="button"
            onClick={onComplete}
            className="w-full text-center text-body-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("onboarding.estimate.skip")}
          </button>
        </div>
      )}
    </div>
  );
}
