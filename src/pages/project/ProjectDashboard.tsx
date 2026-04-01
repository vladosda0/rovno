import { useLayoutEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useProject,
  useTasks,
  useEstimate,
  useDocuments,
  useMedia,
  usePermission,
} from "@/hooks/use-mock-data";
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
  projectDomainAllowsContribute,
  projectDomainAllowsManage,
  projectDomainAllowsView,
} from "@/lib/permissions";
import { Copy, Info, LayoutDashboard, MapPin } from "lucide-react";

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const { toast } = useToast();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [projectId]);

  const { project, stages, members } = useProject(projectId);
  const tasks = useTasks(projectId);
  const estimate = useEstimate(projectId);
  const documents = useDocuments(projectId);
  const media = useMedia(projectId);
  const perm = usePermission(projectId);
  const actorRole = perm.seam.membership?.role ?? "viewer";
  const actorAiAccess = perm.seam.membership?.ai_access ?? "none";
  const participantsAccess = getProjectDomainAccess(perm.seam, "participants");
  const tasksAccess = getProjectDomainAccess(perm.seam, "tasks");
  const documentsAccess = getProjectDomainAccess(perm.seam, "documents");
  const galleryAccess = getProjectDomainAccess(perm.seam, "gallery");
  const procurementAccess = getProjectDomainAccess(perm.seam, "procurement");

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
  const canContributeDocuments = projectDomainAllowsContribute(documentsAccess);
  const canContributeGallery = projectDomainAllowsContribute(galleryAccess);
  const canManageProcurement = projectDomainAllowsManage(procurementAccess);

  const handleCopyAddress = async () => {
    if (!project?.address) return;
    try {
      await navigator.clipboard.writeText(project.address);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (!project) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Project not found"
        description="This project does not exist."
      />
    );
  }

  return (
    <div className="space-y-sp-2">
      <div className="glass rounded-card p-sp-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-sp-3">
          <div className="space-y-2">
            <div>
              <h2 className="text-h2 text-foreground">{project.title}</h2>
              <p className="text-body-sm text-muted-foreground mt-1 capitalize">
                {project.type} · {project.automation_level} automation
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AI Description</p>
              <p className="text-body-sm text-foreground/90 line-clamp-2">
                {project.ai_description || "AI summary placeholder. Project insights will appear here as activity grows."}
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-panel bg-muted/40 px-2 py-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {project.address ? (
                <>
                  <span className="text-caption text-foreground flex-1 truncate">{project.address}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCopyAddress} aria-label="Copy address">
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <span className="text-caption text-muted-foreground">Add address</span>
              )}
            </div>
          </div>

          <div className="rounded-panel bg-muted/30 p-3 flex flex-col justify-between gap-3 min-h-[128px]">
            <div className="flex items-end justify-between">
              <span className="text-body-sm text-muted-foreground inline-flex items-center gap-1.5">
                Progress
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Progress breakdown">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-0.5 text-[11px]">
                      <p>Not started: {taskStatusCounts.notStarted}</p>
                      <p>In progress: {taskStatusCounts.inProgress}</p>
                      <p>Blocked: {taskStatusCounts.blocked}</p>
                      <p>Done: {taskStatusCounts.done}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </span>
              <span className="text-h3 font-semibold text-foreground tabular-nums min-w-[52px] text-right">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2.5 bg-muted/60 [&>div]:rounded-full" />
            <p className="text-caption text-muted-foreground tabular-nums">{doneTasks} done / {totalTasks} total</p>
          </div>
        </div>
      </div>

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
        <BudgetWidget estimate={estimate} projectId={projectId} className="lg:col-span-2 h-full" />
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
