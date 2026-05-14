// Transitional rename: DocumentsTab still owns the flat workspace-documents UI;
// this wrapper presents it under the new "My documents" sub-tab inside DocumentsHubTab.
import { DocumentsTab } from "@/components/home/DocumentsTab";

export function MyDocumentsTab() {
  return <DocumentsTab />;
}
