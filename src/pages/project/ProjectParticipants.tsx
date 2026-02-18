import { EmptyState } from "@/components/EmptyState";
import { Users } from "lucide-react";

export default function ProjectParticipants() {
  return (
    <EmptyState
      icon={Users}
      title="Participants"
      description="Team members, roles, and permissions will be managed here."
      actionLabel="Invite Member"
      onAction={() => {}}
    />
  );
}
