import { useParams } from "react-router-dom";
import { useTasks } from "@/hooks/use-mock-data";
import { getUserById } from "@/data/store";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const taskStatusLabel: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

export default function ProjectTasks() {
  const { id } = useParams<{ id: string }>();
  const tasks = useTasks(id!);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="Tasks"
        description="No tasks yet. Create your first task to get started."
        actionLabel="Create Task"
        onAction={() => {}}
      />
    );
  }

  return (
    <div className="p-sp-3">
      <div className="flex items-center justify-between mb-sp-2">
        <h2 className="text-h3 text-foreground">Tasks</h2>
        <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-1 h-4 w-4" /> Add Task
        </Button>
      </div>
      <div className="space-y-2">
        {tasks.map((task) => {
          const assignee = getUserById(task.assignee_id);
          return (
            <div key={task.id} className="glass rounded-card p-sp-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-body-sm font-medium text-foreground truncate">{task.title}</p>
                <p className="text-caption text-muted-foreground truncate">{task.description}</p>
              </div>
              {assignee && (
                <span className="text-caption text-muted-foreground hidden sm:block">{assignee.name}</span>
              )}
              <StatusBadge status={taskStatusLabel[task.status] ?? task.status} variant="task" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
