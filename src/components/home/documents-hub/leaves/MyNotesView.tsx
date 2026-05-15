import { StickyNote } from "lucide-react";
import { MyAllDocsView } from "@/components/home/documents-hub/leaves/MyAllDocsView";
import type { WorkspaceDoc } from "@/hooks/use-workspace-documents-source";

function isAiOrigin(doc: WorkspaceDoc): boolean {
  return doc.origin === "ai_generated";
}

export function MyNotesView() {
  return (
    <MyAllDocsView
      filter={isAiOrigin}
      titleKey="home.documentsHub.leaves.myNotes.title"
      subtitleKey="home.documentsHub.leaves.myNotes.subtitle"
      sectionSlug="my-notes"
      emptyTitleKey="home.documentsHub.leaves.myNotes.emptyTitle"
      emptyBodyKey="home.documentsHub.leaves.myNotes.emptyBody"
      emptyIcon={StickyNote}
    />
  );
}
