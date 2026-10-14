import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { SignInPrompt } from "@/components/settings/SignInPrompt";
import { TelegramDeliverySection } from "@/components/settings/panels/TelegramDeliverySection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BRIEFING_MINUTE_STEP } from "@/data/briefing-settings-source";
import { useBriefingSettings } from "@/hooks/use-briefing-settings";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";

const MINUTES_IN_DAY = 24 * 60;

function formatBriefingMinute(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${hours}:${String(minute % 60).padStart(2, "0")}`;
}

/** 00:00 to 23:30, the slots the database accepts. */
const BRIEFING_TIMES = Array.from({ length: MINUTES_IN_DAY / BRIEFING_MINUTE_STEP }, (_, slot) => {
  const minute = slot * BRIEFING_MINUTE_STEP;
  return { value: String(minute), label: formatBriefingMinute(minute) };
});

const ROW_CLASS = "flex items-center justify-between gap-sp-2 py-1";
const ROW_LABEL_CLASS = "min-w-0 flex-1 text-body-sm text-foreground";
const PROJECTS_LIST_ID = "briefing-projects-list";

/** Settings -> Notifications: the briefing, the instant messages and where to send, each only as far as the person can change it. */
export function NotificationsPanel() {
  const { t } = useTranslation();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const workspaceMode = useWorkspaceMode();
  const {
    snapshot,
    isLoading,
    isError,
    isSaving,
    saveSettings,
    setProjectMuted,
    setPeopleEnabled,
    setHintsChatEnabled,
  } = useBriefingSettings(() => {
    toast({
      title: t("notifications.saveFailedToast"),
      description: t("notifications.saveFailedDescription"),
      variant: "destructive",
    });
  });

  if (workspaceMode.kind === "guest") {
    return <SignInPrompt hint={t("notifications.signInHint")} ctaLabel={t("notifications.signIn")} />;
  }

  if (!snapshot) {
    if (isLoading) return <Skeleton data-testid="notifications-loading" className="h-24 w-full" />;
    return isError ? <p className="text-body-sm text-muted-foreground">{t("notifications.loadFailed")}</p> : null;
  }

  const { settings, projects } = snapshot;
  // Every role gets hints, so their section stands on its own, between the briefing and the instant messages.
  const hintsSection = (
    <SettingsSection title={t("notifications.hints.title")}>
      <div className={ROW_CLASS}>
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm text-foreground">{t("notifications.hints.chat")}</span>
          <span className="block text-caption text-muted-foreground">{t("notifications.hints.chatHint")}</span>
        </span>
        <Switch
          checked={snapshot.hintsChatEnabled}
          onCheckedChange={setHintsChatEnabled}
          disabled={isSaving}
          aria-label={t("notifications.hints.chat")}
        />
      </div>
    </SettingsSection>
  );
  const instantSection = (
    <SettingsSection title={t("notifications.instant.title")}>
      <div className={ROW_CLASS}>
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm text-foreground">{t("notifications.instant.people")}</span>
          <span className="block text-caption text-muted-foreground">{t("notifications.instant.peopleHint")}</span>
        </span>
        <Switch
          checked={snapshot.peopleEnabled}
          onCheckedChange={setPeopleEnabled}
          disabled={isSaving}
          aria-label={t("notifications.instant.people")}
        />
      </div>
    </SettingsSection>
  );

  // The briefing is written for owners and co-owners only; anyone else has nothing to set up about it.
  if (projects.length === 0) {
    return (
      <div className="space-y-sp-3">
        {hintsSection}
        {instantSection}
        <TelegramDeliverySection />
      </div>
    );
  }

  const muted = new Set(snapshot.mutedProjectIds);
  const selectedCount = projects.filter((project) => !muted.has(project.id)).length;
  const projectsSummary = selectedCount === projects.length
    ? t("notifications.briefing.allProjects")
    : t("notifications.briefing.someProjects", { selected: selectedCount, total: projects.length });
  const ProjectsChevron = projectsOpen ? ChevronUp : ChevronDown;

  return (
    <div className="space-y-sp-3">
      <SettingsSection title={t("notifications.briefing.title")}>
        <div>
          <div className={ROW_CLASS}>
            <span className={ROW_LABEL_CLASS}>{t("notifications.briefing.attention")}</span>
            <div className="flex shrink-0 items-center gap-2">
              <Select
                value={String(settings.minute)}
                onValueChange={(value) => saveSettings({ minute: Number(value) })}
                disabled={isSaving}
              >
                <SelectTrigger className="h-8 w-24" aria-label={t("notifications.briefing.time")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIEFING_TIMES.map((time) => (
                    <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(enabled) => saveSettings({ enabled })}
                disabled={isSaving}
                aria-label={t("notifications.briefing.attention")}
              />
            </div>
          </div>

          <div className={ROW_CLASS}>
            <span className={ROW_LABEL_CLASS}>{t("notifications.briefing.weekends")}</span>
            <Switch
              checked={settings.weekends}
              onCheckedChange={(weekends) => saveSettings({ weekends })}
              disabled={isSaving}
              aria-label={t("notifications.briefing.weekends")}
            />
          </div>

          <div className={ROW_CLASS}>
            <span className={ROW_LABEL_CLASS}>{t("notifications.briefing.projects")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1"
              aria-expanded={projectsOpen}
              aria-controls={PROJECTS_LIST_ID}
              aria-label={`${t("notifications.briefing.projects")}: ${projectsSummary}`}
              onClick={() => setProjectsOpen((open) => !open)}
              disabled={isSaving}
            >
              {projectsSummary}
              <ProjectsChevron className="h-3.5 w-3.5" />
            </Button>
          </div>

          {projectsOpen && (
            <ul id={PROJECTS_LIST_ID} className="mt-1 space-y-1 rounded-card border border-border bg-background/60 p-sp-2">
              {projects.map((project) => {
                const checked = !muted.has(project.id);
                return (
                  <li key={project.id}>
                    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-body-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => setProjectMuted(project.id, next !== true)}
                        disabled={isSaving}
                        aria-label={project.title}
                      />
                      <span className={checked ? "min-w-0 text-foreground" : "min-w-0 text-muted-foreground"}>
                        {project.title}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SettingsSection>
      {hintsSection}
      {instantSection}
      <TelegramDeliverySection />
    </div>
  );
}
