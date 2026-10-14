import { Suspense, lazy, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import {
  closeClientReportDialog,
  getClientReportDialogProjectId,
  subscribeClientReportDialog,
} from "@/lib/client-report-dialog";

const ClientReportDialog = lazy(() =>
  import("@/components/client-report/ClientReportDialog").then((module) => ({
    default: module.ClientReportDialog,
  })),
);

function routeProjectId(pathname: string): string | null {
  const [, section, id] = pathname.split("/");
  return section === "project" && id ? id : null;
}

/** Renders the one "Отчёт клиенту" dialog for whichever project asked for it. */
export function ClientReportDialogHost() {
  const projectId = useSyncExternalStore(subscribeClientReportDialog, getClientReportDialogProjectId);
  const routeProject = routeProjectId(useLocation().pathname);
  const lastRouteProject = useRef(routeProject);

  // The dialog can also be opened from /home for a picked project, so it is
  // a CHANGE of the route's project that closes it, not a mismatch.
  useEffect(() => {
    if (lastRouteProject.current === routeProject) return;
    lastRouteProject.current = routeProject;
    closeClientReportDialog();
  }, [routeProject]);

  useEffect(() => closeClientReportDialog, []);

  if (!projectId) return null;
  return (
    <Suspense fallback={null}>
      <ClientReportDialog
        key={projectId}
        open
        projectId={projectId}
        onOpenChange={(open) => {
          if (!open) closeClientReportDialog();
        }}
      />
    </Suspense>
  );
}
