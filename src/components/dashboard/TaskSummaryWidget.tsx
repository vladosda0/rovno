import { Link } from "react-router-dom";
import { getUserById } from "@/data/store";
import { StatusBadge } from "@/components/StatusBadge";
import { ListTodo, ArrowRight, CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import type { Task } from "@/types/entities";

const taskStatusIcon: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: AlertTriangle,
};
const taskStatusColor: Record<string, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  blocked: "text-destructive",
};

interface Props {
  tasks: Task[];
  projectId: string;
}

export function TaskSummaryWidget({ tasks, projectId }: Props) {
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const recent = tasks.slice(0, 5);

  return (
    <div className="glass rounded-card p-sp-2">
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-accent" /> Tasks
        </h3>
        <Link to={`/project/${projectId}/tasks`} className="text-caption text-accent hover:underline flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-1 mb-sp-2">
        <div className="rounded-panel bg-muted/40 p-1.5 text-center">
          <p className="text-body-sm font-bold text-foreground">{tasks.length}</p>
          <p className="text-[10px] text-muted-foreground">Total</p>
        </div>
        <div className="rounded-panel bg-success/10 p-1.5 text-center">
          <p className="text-body-sm font-bold text-success">{doneTasks}</p>
          <p className="text-[10px] text-muted-foreground">Done</p>
        </div>
        <div className="rounded-panel bg-info/10 p-1.5 text-center">
          <p className="text-body-sm font-bold text-info">{inProgressTasks}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
        <div className="rounded-panel bg-destructive/10 p-1.5 text-center">
          <p className="text-body-sm font-bold text-destructive">{blockedTasks}</p>
          <p className="text-[10px] text-muted-foreground">Blocked</p>
        </div>
      </div>
      <div className="space-y-1">
        {recent.map((t) => {
          const Icon = taskStatusIcon[t.status] ?? Circle;
          const color = taskStatusColor[t.status] ?? "text-muted-foreground";
          const assignee = getUserById(t.assignee_id);
          return (
            <div key={t.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <Icon className={`h-3.5 w-3.5 ${color} shrink-0`} />
              <span className="text-caption text-foreground flex-1 truncate">{t.title}</span>
              {assignee && <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{assignee.name.split(" ")[0]}</span>}
              <StatusBadge status={t.status.replace(/_/g, " ")} variant="task" className="text-[10px] px-1.5 py-0" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
