import { Outlet, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceMode, useWorkspaceProjectState } from "@/hooks/use-workspace-source";
import { projectDomainAllowsRoute, usePermission, type ProjectDomain } from "@/lib/permissions";

const ROUTE_DOMAIN_BY_SEGMENT: Partial<Record<string, ProjectDomain>> = {
  estimate: "estimate",
  tasks: "tasks",
  procurement: "procurement",
  hr: "hr",
  gallery: "gallery",
  documents: "documents",
  participants: "participants",
};

function ProjectLayoutSkeleton() {
  return (
    <div className="flex-1 p-sp-3">
      <div className="space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-36 rounded-card" />
          <Skeleton className="h-36 rounded-card" />
        </div>
      </div>
    </div>
  );
}

export default function ProjectLayout() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  const perm = usePermission(id ?? "");
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(id ?? "");
  const routeSegment = location.pathname.split("/")[3] ?? null;
  const routeDomain = routeSegment ? (ROUTE_DOMAIN_BY_SEGMENT[routeSegment] ?? null) : null;

  // Redirect /project/:id to /project/:id/dashboard
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/dashboard`} replace />;
  }

  if (workspaceMode.kind === "guest") {
    return <Navigate to="/auth/login" replace />;
  }

  if (workspaceMode.kind === "pending-supabase" || (workspaceMode.kind === "supabase" && (isProjectLoading || perm.isLoading))) {
    return <ProjectLayoutSkeleton />;
  }

  if (workspaceMode.kind === "supabase" && !project) {
    return (
      <div className="flex-1 p-sp-3">
        <EmptyState
          icon={AlertTriangle}
          title={t("projectLayout.notFound.title")}
          description={t("projectLayout.notFound.description")}
        />
      </div>
    );
  }

  if (!projectDomainAllowsRoute(perm.seam, routeDomain)) {
    return (
      <div className="flex-1 p-sp-3">
        <EmptyState
          icon={AlertTriangle}
          title={t("projectLayout.noAccess.title")}
          description={t("projectLayout.noAccess.description")}
          actionLabel={t("projectLayout.noAccess.backToDashboard")}
          onAction={() => navigate(`/project/${id}/dashboard`)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 p-sp-3">
        <Outlet />
      </div>
    </div>
  );
}
