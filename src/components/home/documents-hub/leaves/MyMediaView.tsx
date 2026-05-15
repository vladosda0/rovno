import { Image } from "lucide-react";
import { MyAllDocsView } from "@/components/home/documents-hub/leaves/MyAllDocsView";
import type { WorkspaceDoc } from "@/hooks/use-workspace-documents-source";

export function isMediaMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  return mime.startsWith("image/") || mime.startsWith("video/");
}

function isMediaDoc(doc: WorkspaceDoc): boolean {
  return isMediaMime(doc.mimeType);
}

export function MyMediaView() {
  return (
    <MyAllDocsView
      filter={isMediaDoc}
      titleKey="home.documentsHub.leaves.myMedia.title"
      subtitleKey="home.documentsHub.leaves.myMedia.subtitle"
      sectionSlug="my-media"
      emptyTitleKey="home.documentsHub.leaves.myMedia.emptyTitle"
      emptyBodyKey="home.documentsHub.leaves.myMedia.emptyBody"
      emptyIcon={Image}
    />
  );
}
