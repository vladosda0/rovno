import { FileText } from "lucide-react";
import { MyAllDocsView } from "@/components/home/documents-hub/leaves/MyAllDocsView";

export function MyAllDocsLeaf() {
  return (
    <MyAllDocsView
      titleKey="home.documentsHub.leaves.myAll.title"
      subtitleKey="home.documentsHub.leaves.myAll.subtitle"
      sectionSlug="my-all"
      emptyTitleKey="home.documentsHub.leaves.myAll.emptyTitle"
      emptyBodyKey="home.documentsHub.leaves.myAll.emptyBody"
      emptyIcon={FileText}
    />
  );
}
