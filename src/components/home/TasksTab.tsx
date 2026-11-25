import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, AlertTriangle, CheckCircle2, Circle, Clock, Ban } from "lucide-react";
import * as store from "@/data/store";
import { useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useWorkspaceTasksState } from "@/hooks/use-planning-source";
import type { TaskStatus } from "@/types/entities";
import { useToast } from "@/hooks/use-toast";

const STATUS_ICON: Record<TaskStatus, React.ElementType> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: Ban,
};
const STATUS_LABEL_KEY: Record<TaskStatus, string> = {
  not_started: "status.notStarted",
  in_progress: "status.inProgress",
  done: "status.done",
  blocked: "status.blocked",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  blocked: "text-destructive",
};

export function TasksTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const projects = useProjects();
  const { tasks: allTasks, isLoading, isError } = useWorkspaceTasksState();
  // Status writes here go to the demo store only; a signed-in user changes a
  // task on its project board, where the done checks read the real data.
  const canToggle = useWorkspaceMode().kind !== "supabase";
  const projectTitleById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.title])),
    [projects],
  );

  const overdue = useMemo(() => allTasks.filter((t) => {
    if (!t.deadline || t.status === "done") return false;
    return new Date(t.deadline) < new Date();
  }), [allTasks]);

  const filtered = useMemo(() => {
    return allTasks.filter((t) => {
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (projectFilter !== "all" && t.project_id !== projectFilter) return false;
      return true;
    });
  }, [allTasks, search, statusFilter, projectFilter]);

  function handleToggleDone(taskId: string, currentStatus: TaskStatus) {
    if (currentStatus === "done") {
      store.updateTask(taskId, { status: "not_started" });
      return;
    }

    const task = allTasks.find((entry) => entry.id === taskId);
    if (!task) return;
    if (task.checklist.some((item) => !item.done)) {
      toast({
        title: t("tasksTab.markDoneBlocked"),
        description: t("tasksTab.markDoneBlockedBody"),
        variant: "destructive",
      });
      return;
    }

    const hasFinalMedia = store
      .getMedia(task.project_id)
      .some((mediaItem) => mediaItem.task_id === task.id && mediaItem.is_final);
    if (!hasFinalMedia) {
      toast({
        title: t("tasksTab.markDoneNoFinal"),
        description: t("tasksTab.markDoneNoFinalBody"),
        variant: "destructive",
      });
      return;
    }

    store.updateTask(taskId, { status: "done" });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("tasksTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder={t("tasksTab.statusPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tasksTab.allStatuses")}</SelectItem>
            <SelectItem value="not_started">{t("status.notStarted")}</SelectItem>
            <SelectItem value="in_progress">{t("status.inProgress")}</SelectItem>
            <SelectItem value="done">{t("status.done")}</SelectItem>
            <SelectItem value="blocked">{t("status.blocked")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder={t("tasksTab.projectPlaceholder")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("tasksTab.allProjects")}</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Overdue section */}
      {overdue.length > 0 && statusFilter === "all" && projectFilter === "all" && (
        <Card className="border-destructive/30">
          <CardContent className="p-4 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-destructive sm:mb-4">
              <AlertTriangle className="h-4 w-4" /> {t("tasksTab.overdue")} ({overdue.length})
            </h3>
            <div className="space-y-1">
              {overdue.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectTitle={projectTitleById.get(task.project_id)}
                  onToggle={canToggle ? handleToggleDone : undefined}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All tasks */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-3 text-body font-semibold text-foreground sm:mb-4">
            {t("tasksTab.tasksHeading")}{!isLoading && !isError && ` (${filtered.length})`}
          </h3>
          <div className="space-y-1">
            {filtered.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                projectTitle={projectTitleById.get(task.project_id)}
                onToggle={canToggle ? handleToggleDone : undefined}
              />
            ))}
            {isError && (
              <p className="text-caption text-destructive py-6 text-center">{t("tasksTab.loadFailed")}</p>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <p className="text-caption text-muted-foreground py-6 text-center">{t("tasksTab.noMatch")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TaskRow({ task, projectTitle, onToggle }: {
  task: { id: string; title: string; status: TaskStatus; project_id: string; deadline?: string };
  projectTitle?: string;
  onToggle?: (id: string, status: TaskStatus) => void;
}) {
  const { t } = useTranslation();
  const Icon = STATUS_ICON[task.status];
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
      {onToggle ? (
        <button onClick={() => onToggle(task.id, task.status)} className={`shrink-0 ${STATUS_COLOR[task.status]}`}>
          <Icon className="h-4 w-4" />
        </button>
      ) : (
        <Icon className={`h-4 w-4 shrink-0 ${STATUS_COLOR[task.status]}`} aria-hidden="true" />
      )}
      <Link to={`/project/${task.project_id}/tasks`} className="flex-1 min-w-0">
        <p className={`text-body-sm text-foreground truncate ${task.status === "done" ? "line-through opacity-60" : ""}`}>
          {task.title}
        </p>
      </Link>
      {projectTitle && (
        <Badge variant="secondary" className="text-[10px] shrink-0">{projectTitle}</Badge>
      )}
      <span className="text-caption text-muted-foreground shrink-0">{t(STATUS_LABEL_KEY[task.status])}</span>
    </div>
  );
}
