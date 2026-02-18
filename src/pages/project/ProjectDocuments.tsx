import { EmptyState } from "@/components/EmptyState";
import { FileText } from "lucide-react";

export default function ProjectDocuments() {
  return (
    <EmptyState
      icon={FileText}
      title="Documents"
      description="Project files, contracts, and documentation will be organized here."
      actionLabel="Upload Document"
      onAction={() => {}}
    />
  );
}
