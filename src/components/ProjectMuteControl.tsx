import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useBriefingSettings } from "@/hooks/use-briefing-settings";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { cn } from "@/lib/utils";

interface ProjectMuteProps {
  projectId: string;
  projectTitle: string;
}

/**
 * "Do not disturb" for one project of the signed-in person. It reads and writes through the
 * briefing settings, so it is the same row, and the same cached answer, as the project's tick
 * under "For which projects" in Settings. Null while the state is not known.
 */
function useProjectMute(projectId: string): { muted: boolean; isSaving: boolean; setMuted: (muted: boolean) => void } | null {
  const { t } = useTranslation();
  const { snapshot, isSaving, setProjectMuted } = useBriefingSettings(() => {
    toast({
      title: t("notifications.saveFailedToast"),
      description: t("notifications.saveFailedDescription"),
      variant: "destructive",
    });
  });

  if (!snapshot) return null;
  return {
    muted: snapshot.mutedProjectIds.includes(projectId),
    isSaving,
    setMuted: (muted) => setProjectMuted(projectId, muted),
  };
}

function MuteSwitchRow({ projectId, projectTitle, className }: ProjectMuteProps & { className?: string }) {
  const { t } = useTranslation();
  const mute = useProjectMute(projectId);
  if (!mute) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 flex-1 text-body-sm font-medium text-foreground">
          {t("notifications.projectMute.label")}
        </span>
        <Switch
          checked={mute.muted}
          onCheckedChange={mute.setMuted}
          disabled={mute.isSaving}
          aria-label={t("notifications.projectMute.label")}
        />
      </div>
      <p className="mt-1 text-caption text-muted-foreground">
        {t("notifications.projectMute.hint", { project: projectTitle })}
      </p>
    </div>
  );
}

function SignedInProjectMuteBell({ projectId, projectTitle }: ProjectMuteProps) {
  const { t } = useTranslation();
  const mute = useProjectMute(projectId);
  if (!mute) return null;

  const label = t(mute.muted ? "notifications.projectMute.bellMuted" : "notifications.projectMute.bell");
  const Icon = mute.muted ? BellOff : Bell;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          data-muted={mute.muted}
          aria-label={label}
          title={label}
          className={cn("h-7 w-7 shrink-0", mute.muted && "border-accent/50 bg-accent/15 text-foreground")}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-card p-3">
        <MuteSwitchRow projectId={projectId} projectTitle={projectTitle} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bell next to the project's name in the top bar. Only for a signed-in person: in the demo,
 * in the local playground and for a guest nobody is ever sent anything.
 */
export function ProjectMuteBell(props: ProjectMuteProps) {
  const mode = useWorkspaceMode();
  return mode.kind === "supabase" ? <SignedInProjectMuteBell {...props} /> : null;
}

/** The same setting as a row of the phone's side menu. */
export function ProjectMuteRow(props: ProjectMuteProps) {
  const mode = useWorkspaceMode();
  return mode.kind === "supabase" ? <MuteSwitchRow {...props} className="px-3 py-2" /> : null;
}
