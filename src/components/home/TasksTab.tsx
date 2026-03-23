import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, AlertTriangle, CheckCircle2, Circle, Clock, Ban } from "lucide-react";
import * as store from "@/data/store";
import type { TaskStatus } from "@/types/entities";
import { useToast } from "@/hooks/use-toast";

const STATUS_ICON: Record<TaskStatus, React.ElementType> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: Ban,
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  blocked: "text-destructive",
};

export function TasksTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const allTasks = store.getAllTasks();
  const projects = store.getProjects();

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
        title: "Cannot mark as Done",
        description: "All checklist items must be checked or resolved first.",
        variant: "destructive",
      });
      return;
    }

    const hasFinalMedia = store
      .getMedia(task.project_id)
      .some((mediaItem) => mediaItem.task_id === task.id && mediaItem.is_final);
    if (!hasFinalMedia) {
      toast({
        title: "No final-result media",
        description: "Upload at least one final-result photo before moving this task to Done.",
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
          <Input placeholder="Search tasks…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_started">Not started</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Overdue section */}
      {overdue.length > 0 && statusFilter === "all" && projectFilter === "all" && (
        <Card className="border-destructive/30">
          <CardContent className="p-4 sm:p-6">
            <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-destructive sm:mb-4">
              <AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})
            </h3>
            <div className="space-y-1">
              {overdue.map((t) => {
                const project = store.getProject(t.project_id);
                return (
                  <TaskRow key={t.id} task={t} projectTitle={project?.title} onToggle={handleToggleDone} />
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All tasks */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-3 text-body font-semibold text-foreground sm:mb-4">
            Tasks ({filtered.length})
          </h3>
          <div className="space-y-1">
            {filtered.map((t) => {
              const project = store.getProject(t.project_id);
              return <TaskRow key={t.id} task={t} projectTitle={project?.title} onToggle={handleToggleDone} />;
            })}
            {filtered.length === 0 && (
              <p className="text-caption text-muted-foreground py-6 text-center">No tasks match your filters.</p>
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
  onToggle: (id: string, status: TaskStatus) => void;
}) {
  const Icon = STATUS_ICON[task.status];
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
      <button onClick={() => onToggle(task.id, task.status)} className={`shrink-0 ${STATUS_COLOR[task.status]}`}>
        <Icon className="h-4 w-4" />
      </button>
      <Link to={`/project/${task.project_id}/tasks`} className="flex-1 min-w-0">
        <p className={`text-body-sm text-foreground truncate ${task.status === "done" ? "line-through opacity-60" : ""}`}>
          {task.title}
        </p>
      </Link>
      {projectTitle && (
        <Badge variant="secondary" className="text-[10px] shrink-0">{projectTitle}</Badge>
      )}
      <span className="text-caption text-muted-foreground shrink-0">{STATUS_LABEL[task.status]}</span>
    </div>
  );
}
