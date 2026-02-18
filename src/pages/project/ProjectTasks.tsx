import { EmptyState } from "@/components/EmptyState";
import { ListTodo } from "lucide-react";

export default function ProjectTasks() {
  return (
    <EmptyState
      icon={ListTodo}
      title="Tasks"
      description="Project tasks, assignments, and progress tracking will be managed here."
      actionLabel="Create Task"
      onAction={() => {}}
    />
  );
}
