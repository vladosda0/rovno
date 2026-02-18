import { EmptyState } from "@/components/EmptyState";
import { Activity } from "lucide-react";

export default function ProjectActivity() {
  return (
    <EmptyState
      icon={Activity}
      title="Activity"
      description="Project event feed and change history will be tracked here."
    />
  );
}
