import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import type { Project, Stage, Task } from "@/types/entities";

interface Props {
  project: Project;
  stages: Stage[];
  tasks: Task[];
}

export function ProgressWidget({ project, stages, tasks }: Props) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-card p-sp-2">
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground">{t("progressWidget.title")}</h3>
        <span className="text-h3 font-bold text-foreground">{project.progress_pct}%</span>
      </div>
      <Progress value={project.progress_pct} className="h-2.5 mb-sp-2" />
      <div className="space-y-1.5">
        {stages.map((s) => {
          const stageTasks = tasks.filter((task) => task.stage_id === s.id);
          const done = stageTasks.filter((task) => task.status === "done").length;
          const pct = stageTasks.length > 0 ? Math.round((done / stageTasks.length) * 100) : 0;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <span className="text-caption text-foreground flex-1 truncate">{s.title}</span>
              <Progress value={pct} className="h-1 w-16" />
              <StatusBadge
                status={s.status === "completed" ? "Done" : "In progress"}
                variant="task"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
