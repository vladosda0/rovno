import { useParams } from "react-router-dom";
import { useProject, useTasks, useEstimate, useDocuments, useMedia, usePermission } from "@/hooks/use-mock-data";
import { EmptyState } from "@/components/EmptyState";
import { ProgressWidget } from "@/components/dashboard/ProgressWidget";
import { BudgetWidget } from "@/components/dashboard/BudgetWidget";
import { TaskSummaryWidget } from "@/components/dashboard/TaskSummaryWidget";
import { DocsWidget } from "@/components/dashboard/DocsWidget";
import { GalleryWidget } from "@/components/dashboard/GalleryWidget";
import { ParticipantsWidget } from "@/components/dashboard/ParticipantsWidget";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { LayoutDashboard } from "lucide-react";

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const { project, stages, members } = useProject(id!);
  const tasks = useTasks(id!);
  const estimate = useEstimate(id!);
  const documents = useDocuments(id!);
  const media = useMedia(id!);
  const { can: userCan } = usePermission(id!);

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
      {/* Header */}
      <div className="glass rounded-card p-sp-3">
        <h2 className="text-h2 text-foreground">{project.title}</h2>
        <p className="text-body-sm text-muted-foreground mt-1 capitalize">
          {project.type} · {project.automation_level} automation
        </p>
      </div>

      {/* Quick Actions */}
      <QuickActions canCreate={userCan("task.create")} />

      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sp-2">
        <ProgressWidget project={project} stages={stages} tasks={tasks} />
        <BudgetWidget estimate={estimate} />
        <TaskSummaryWidget tasks={tasks} projectId={id!} />
        <DocsWidget documents={documents} projectId={id!} />
        <GalleryWidget media={media} projectId={id!} />
        <ParticipantsWidget members={members} projectId={id!} />
      </div>
    </div>
  );
}
