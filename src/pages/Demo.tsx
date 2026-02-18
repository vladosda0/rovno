import { EmptyState } from "@/components/EmptyState";
import { Eye } from "lucide-react";

export default function Demo() {
  return (
    <EmptyState
      icon={Eye}
      title="Demo Project"
      description="Explore a read-only demo project to see StroyAgent in action."
    />
  );
}
