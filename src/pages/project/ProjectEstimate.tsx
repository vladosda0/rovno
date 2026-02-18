import { EmptyState } from "@/components/EmptyState";
import { Calculator } from "lucide-react";

export default function ProjectEstimate() {
  return (
    <EmptyState
      icon={Calculator}
      title="Estimate"
      description="Cost estimates, line items, and budget tracking will be managed here."
      actionLabel="Create Estimate"
      onAction={() => {}}
    />
  );
}
