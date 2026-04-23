import { useLayoutEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  useProject,
  useTasks,
  useDocuments,
  useMedia,
  usePermission,
} from "@/hooks/use-mock-data";
import {
  useEstimateV2FinanceProjectSummaryFromWorkspace,
  useEstimateV2Project,
} from "@/hooks/use-estimate-v2-data";
import { EmptyState } from "@/components/EmptyState";
import { BudgetWidget } from "@/components/dashboard/BudgetWidget";
import { TaskSummaryWidget } from "@/components/dashboard/TaskSummaryWidget";
import { DocsWidget } from "@/components/dashboard/DocsWidget";
import { GalleryWidget } from "@/components/dashboard/GalleryWidget";
import { ParticipantsWidget } from "@/components/dashboard/ParticipantsWidget";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  getProjectDomainAccess,
  projectDomainAllowsManage,
  projectDomainAllowsView,
  seamCanViewSensitiveDetail,
} from "@/lib/permissions";
import { resolveActionState } from "@/lib/permission-contract-actions";
import { Copy, Info, LayoutDashboard, MapPin } from "lucide-react";

export default function ProjectDashboard() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const navigate = useNavigate();
  const { toast } = useToast();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [projectId]);

  const { project, stages, members } = useProject(projectId);
  const tasks = useTasks(projectId);
  const documents = useDocuments(projectId);
  const media = useMedia(projectId);
  const perm = usePermission(projectId);
  const hrReadsEnabled = projectDomainAllowsView(getProjectDomainAccess(perm.seam, "hr"));
  const financeSummary = useEstimateV2FinanceProjectSummaryFromWorkspace(projectId, project ?? null, {
    hrReadsEnabled,
  });
  const estimateProject = useEstimateV2Project(projectId);
  const hasEstimate =
    estimateProject.stages.length > 0 ||
    estimateProject.works.length > 0 ||
    estimateProject.lines.length > 0 ||
    estimateProject.versions.length > 0;
  const actorRole = perm.seam.membership?.role ?? "viewer";
  const actorAiAccess = perm.seam.membership?.ai_access ?? "none";
  const participantsAccess = getProjectDomainAccess(perm.seam, "participants");
  const tasksAccess = getProjectDomainAccess(perm.seam, "tasks");
  const procurementAccess = getProjectDomainAccess(perm.seam, "procurement");
  const canViewSensitiveDetail = seamCanViewSensitiveDetail(perm.seam);

  const doneTasks = useMemo(
    () => tasks.filter((task) => task.status === "done" || (task.status as string) === "completed").length,
    [tasks],
  );
  const taskStatusCounts = useMemo(() => ({
    notStarted: tasks.filter((task) => task.status === "not_started").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    done: tasks.filter((task) => task.status === "done" || (task.status as string) === "completed").length,
  }), [tasks]);
  const totalTasks = tasks.length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const canManageParticipants = projectDomainAllowsManage(participantsAccess);
  const canManageTasks = projectDomainAllowsManage(tasksAccess);
  const canContributeDocuments = resolveActionState(perm.role, "documents_media", "upload") === "enabled";
  const canContributeGallery = resolveActionState(perm.role, "documents_media", "upload") === "enabled";
  const canManageProcurement = projectDomainAllowsManage(procurementAccess);

  const handleCopyAddress = async () => {
    if (!project?.address) return;
    try {
      await navigator.clipboard.writeText(project.address);
      toast({ title: t("projectDashboard.copied") });
    } catch {
      toast({ title: t("projectDashboard.copyFailed"), variant: "destructive" });
    }
  };

  if (!project) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title={t("projectDashboard.notFoundTitle")}
        description={t("projectDashboard.notFoundDescription")}
      />
    );
  }

  const typeLabel = t(`projectDashboard.type.${project.type}`, { defaultValue: project.type });
  const automationLabel = t(`projectDashboard.automation.${project.automation_level}`, { defaultValue: project.automation_level });

  return (
    <div className="space-y-sp-2">
      <div className="glass rounded-card p-sp-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-sp-3">
          <div className="space-y-2">
            <div>
              <h2 className="text-h2 text-foreground">{project.title}</h2>
              <p className="text-body-sm text-muted-foreground mt-1">
                {t("projectDashboard.typeAutomationLine", { type: typeLabel, automation: automationLabel })}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("projectDashboard.aiDescription")}</p>
              <p className="text-body-sm text-foreground/90 line-clamp-2">
                {project.ai_description || t("projectDashboard.aiDescriptionPlaceholder")}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-panel bg-muted/40 px-2 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {project.address ? (
                <>
                  <span className="text-caption text-foreground flex-1 truncate">{project.address}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCopyAddress} aria-label={t("projectDashboard.copyAddress")}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <span className="text-caption text-muted-foreground">{t("projectDashboard.addAddress")}</span>
              )}
            </div>
          </div>

          <div className="rounded-panel bg-muted/30 p-3 flex flex-col justify-between gap-3 min-h-[128px]">
            <div className="flex items-end justify-between">
              <span className="text-body-sm text-muted-foreground inline-flex items-center gap-1.5">
                {t("projectDashboard.progress")}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label={t("projectDashboard.progressBreakdown")}>
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-0.5 text-[11px]">
                      <p>{t("projectDashboard.progress.notStarted", { count: taskStatusCounts.notStarted })}</p>
                      <p>{t("projectDashboard.progress.inProgress", { count: taskStatusCounts.inProgress })}</p>
                      <p>{t("projectDashboard.progress.blocked", { count: taskStatusCounts.blocked })}</p>
                      <p>{t("projectDashboard.progress.done", { count: taskStatusCounts.done })}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-h3 font-semibold text-foreground tabular-nums min-w-[52px] text-right">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2.5 bg-muted/60 [&>div]:rounded-full" />
            <p className="text-caption text-muted-foreground tabular-nums">{t("projectDashboard.tasksCount", { done: doneTasks, total: totalTasks })}</p>
          </div>
        </div>
      </div>

      {!hasEstimate && !estimateProject.isLoading && (
        <div className="rounded-panel border border-accent/30 bg-accent/5 p-sp-3 flex items-center justify-between gap-sp-2">
          <div>
            <p className="text-body-sm font-medium text-foreground">{t("dashboard.noEstimate.title")}</p>
            <p className="text-caption text-muted-foreground">{t("dashboard.noEstimate.subtitle")}</p>
          </div>
          <Button
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
            onClick={() => navigate(`/project/${projectId}/estimate`)}
          >
            {t("dashboard.noEstimate.cta")}
          </Button>
        </div>
      )}

      <QuickActions
        projectId={projectId}
        projectMode={project.project_mode === "build_myself" ? "build_myself" : "contractor"}
        members={members}
        stages={stages}
        tasks={tasks}
        canCreateTask={canManageTasks}
        canCreateDocument={canContributeDocuments}
        canCreatePhoto={canContributeGallery}
        canManageProcurement={canManageProcurement}
        canManageParticipants={canManageParticipants}
        actorRole={actorRole}
        actorAiAccess={actorAiAccess}
      />

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-sp-2 items-stretch">
        <TaskSummaryWidget tasks={tasks} projectId={projectId} className="lg:col-span-4 h-full" />
        {canViewSensitiveDetail && (
          <BudgetWidget summary={financeSummary} projectId={projectId} className="lg:col-span-2 h-full" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-sp-2 items-stretch">
        <DocsWidget documents={documents} projectId={projectId} className="lg:col-span-4 h-full" />
        <GalleryWidget media={media} projectId={projectId} className="lg:col-span-4 h-full" />
        {projectDomainAllowsView(participantsAccess) && (
          <ParticipantsWidget members={members} projectId={projectId} className="lg:col-span-4 h-full" />
        )}
      </div>
    </div>
  );
}
