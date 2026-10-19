import { Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { useWorkspaceCurrentUserState } from "@/hooks/use-workspace-source";
import {
  CLIENT_REPORT_QUERY_PARAM,
  CLIENT_REPORT_QUERY_VALUE,
  canOpenClientReport,
  closeClientReportDialog,
  getClientReportDialogProjectId,
  openClientReportDialog,
  subscribeClientReportDialog,
} from "@/lib/client-report-dialog";
import { usePermission } from "@/lib/permissions";

const ClientReportDialog = lazy(() =>
  import("@/components/client-report/ClientReportDialog").then((module) => ({
    default: module.ClientReportDialog,
  })),
);

function routeProjectId(pathname: string): string | null {
  const [, section, id] = pathname.split("/");
  return section === "project" && id ? id : null;
}

/**
 * Answers `?report=client` on a page of the project: once the role is known, takes the mark out
 * of the address and, for someone who may publish, reports the project to `onAllowed`.
 */
function ClientReportLinkRequest({ projectId, onAllowed }: { projectId: string; onAllowed: (projectId: string) => void }) {
  const workspaceMode = useWorkspaceMode();
  const permission = usePermission(projectId);
  // The role is read from the person's own profile as well as from the project.
  const isLoading = useWorkspaceCurrentUserState().isLoading || permission.isLoading;
  const seam = permission.seam;
  const [, setSearchParams] = useSearchParams();
  const allowed = canOpenClientReport(seam, workspaceMode.kind);

  useEffect(() => {
    if (isLoading) return;
    if (allowed) onAllowed(projectId);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(CLIENT_REPORT_QUERY_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [allowed, isLoading, onAllowed, projectId, setSearchParams]);

  return null;
}

/** Renders the one "Отчёт клиенту" dialog for whichever project asked for it. */
export function ClientReportDialogHost() {
  const projectId = useSyncExternalStore(subscribeClientReportDialog, getClientReportDialogProjectId);
  const location = useLocation();
  const routeProject = routeProjectId(location.pathname);
  const lastRouteProject = useRef(routeProject);
  const requestedByLink = routeProject !== null
    && new URLSearchParams(location.search).get(CLIENT_REPORT_QUERY_PARAM) === CLIENT_REPORT_QUERY_VALUE;
  const [linkProject, setLinkProject] = useState<string | null>(null);

  // The dialog can also be opened from /home for a picked project, so it is
  // a CHANGE of the route's project that closes it, not a mismatch.
  useEffect(() => {
    if (lastRouteProject.current === routeProject) return;
    lastRouteProject.current = routeProject;
    closeClientReportDialog();
  }, [routeProject]);

  // Opened one render after the request, so that the close above, which the same arrival at the
  // project causes, has already happened.
  useEffect(() => {
    if (linkProject === null) return;
    setLinkProject(null);
    if (linkProject === routeProject) openClientReportDialog(linkProject);
  }, [linkProject, routeProject]);

  useEffect(() => closeClientReportDialog, []);

  return (
    <>
      {requestedByLink && routeProject && (
        <ClientReportLinkRequest key={routeProject} projectId={routeProject} onAllowed={setLinkProject} />
      )}
      {projectId && (
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
      )}
    </>
  );
}
