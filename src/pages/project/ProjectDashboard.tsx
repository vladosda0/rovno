import { useParams } from "react-router-dom";
import { useProject, useTasks, useEvents } from "@/hooks/use-mock-data";
import { getUserById } from "@/data/store";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { LayoutDashboard } from "lucide-react";

const taskStatusLabel: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const stageStatusLabel: Record<string, string> = {
  open: "In progress",
  completed: "Done",
  archived: "Archived",
};

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const { project, stages } = useProject(id!);
  const tasks = useTasks(id!);
  const events = useEvents(id!);

  if (!project) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Project not found"
        description="This project does not exist."
      />
    );
  }

  const recentEvents = events.slice(0, 5);

  return (
    <div className="p-sp-3 space-y-sp-3">
      {/* Header */}
      <div>
        <h2 className="text-h2 text-foreground">{project.title}</h2>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={project.progress_pct} className="h-2 flex-1 max-w-xs" />
          <span className="text-caption text-muted-foreground">{project.progress_pct}%</span>
        </div>
      </div>

      {/* Stages */}
      <div>
        <h3 className="text-body font-semibold text-foreground mb-sp-1">Stages</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sp-1">
          {stages.map((s) => {
            const stageTasks = tasks.filter((t) => t.stage_id === s.id);
            const doneTasks = stageTasks.filter((t) => t.status === "done").length;
            return (
              <div key={s.id} className="glass rounded-card p-sp-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-body-sm font-medium text-foreground">{s.title}</span>
                  <StatusBadge status={stageStatusLabel[s.status] ?? s.status} variant="task" />
                </div>
                <p className="text-caption text-muted-foreground">
                  {doneTasks}/{stageTasks.length} tasks done
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className="text-body font-semibold text-foreground mb-sp-1">Recent Activity</h3>
        <div className="space-y-2">
          {recentEvents.map((evt) => {
            const actor = getUserById(evt.actor_id);
            return (
              <div key={evt.id} className="flex items-start gap-2 text-body-sm">
                <span className="font-medium text-foreground">{actor?.name ?? "Unknown"}</span>
                <span className="text-muted-foreground">
                  {evt.type.replace(/_/g, " ")} — {String((evt.payload as Record<string, unknown>).title ?? (evt.payload as Record<string, unknown>).caption ?? (evt.payload as Record<string, unknown>).name ?? "")}
                </span>
                <span className="ml-auto text-caption text-muted-foreground whitespace-nowrap">
                  {new Date(evt.timestamp).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
