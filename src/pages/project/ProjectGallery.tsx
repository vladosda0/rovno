import { EmptyState } from "@/components/EmptyState";
import { Image } from "lucide-react";

export default function ProjectGallery() {
  return (
    <EmptyState
      icon={Image}
      title="Gallery"
      description="Project photos and visual documentation will be displayed here."
      actionLabel="Upload Photos"
      onAction={() => {}}
    />
  );
}
