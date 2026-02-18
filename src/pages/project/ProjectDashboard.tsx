import { EmptyState } from "@/components/EmptyState";
import { LayoutDashboard } from "lucide-react";

export default function ProjectDashboard() {
  return (
    <EmptyState
      icon={LayoutDashboard}
      title="Project Dashboard"
      description="Project overview, KPIs, and recent activity will appear here."
    />
  );
}
