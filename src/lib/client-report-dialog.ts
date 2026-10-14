// One "Отчёт клиенту" dialog for the whole app shell. The dashboard button and
// the chat suggestion both ask for it here; ClientReportDialogHost in AppLayout
// renders it.

import { getProjectRole, type ProjectAuthoritySeam } from "@/lib/permissions";

export const CLIENT_REPORT_CHIP_KEY = "ai.sidebar.suggestion.clientStatus";

type Listener = () => void;

let openProjectId: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function openClientReportDialog(projectId: string): void {
  if (!projectId) return;
  openProjectId = projectId;
  emit();
}

export function closeClientReportDialog(): void {
  if (openProjectId === null) return;
  openProjectId = null;
  emit();
}

export function getClientReportDialogProjectId(): string | null {
  return openProjectId;
}

export function subscribeClientReportDialog(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * May this member build and publish a client report for the project?
 *
 * Mirrors preview_client_report / publish_client_report in rovno-db: owner or
 * co_owner.
 */
export function seamAllowsClientReport(seam: ProjectAuthoritySeam | null | undefined): boolean {
  if (!seam) return false;
  const role = getProjectRole(seam);
  return role === "owner" || role === "co_owner";
}

/** The report lives on the backend only, so it is offered in Supabase mode and nowhere else. */
export function canOpenClientReport(
  seam: ProjectAuthoritySeam | null | undefined,
  workspaceKind: string,
): boolean {
  return workspaceKind === "supabase" && seamAllowsClientReport(seam);
}
