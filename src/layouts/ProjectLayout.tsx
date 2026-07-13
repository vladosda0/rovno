import { useLayoutEffect } from "react";
import { Outlet, Navigate, useParams, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ProjectSyncIndicator } from "@/components/project/ProjectSyncIndicator";
import { Skeleton } from "@/components/ui/skeleton";
import { registerEstimateV2ProjectAccessContext } from "@/data/estimate-v2-store";
import { useProjectRealtimeInvalidation } from "@/hooks/use-project-realtime-invalidation";
import { useProjectSyncGuards } from "@/hooks/use-project-sync-guards";
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
  // P2 cross-session truth: realtime invalidation feed + flush/unload guards.
  const syncFeedHealth = useProjectRealtimeInvalidation(id);
  useProjectSyncGuards(id);
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(id ?? "");
  const routeSegment = location.pathname.split("/")[3] ?? null;
  const routeDomain = routeSegment ? (ROUTE_DOMAIN_BY_SEGMENT[routeSegment] ?? null) : null;

  // Register the estimate access context for EVERY project page, not only the
  // two pages that historically registered it (Estimate, Procurement). Without
  // this, a cold load of Tasks/HR/Dashboard leaves the session's projection
  // capability unknown ("reader"), silencing the owner's persisted sync
  // error/behind state; it also re-stamps identity on account switches so the
  // previous user's runtime state is cleared at the first project entry.
  const membershipRole = perm.seam.membership?.role ?? null;
  const membershipFinanceVisibility = perm.seam.membership?.finance_visibility ?? null;
  const supabaseProfileId = workspaceMode.kind === "supabase" ? workspaceMode.profileId : null;
  const projectOwnerProfileId = project?.owner_id ?? null;
  useLayoutEffect(() => {
    if (!id || !supabaseProfileId || !projectOwnerProfileId || perm.isLoading) return;
    registerEstimateV2ProjectAccessContext(id, {
      mode: "supabase",
      profileId: supabaseProfileId,
      projectOwnerProfileId,
      membershipRole,
      financeVisibility: membershipFinanceVisibility,
    });
    // No cleanup: the retained-context fallback owns post-unmount semantics;
    // pages that register their own context (Estimate, Procurement) overwrite
    // this registration with the same session key.
  }, [id, supabaseProfileId, projectOwnerProfileId, membershipRole, membershipFinanceVisibility, perm.isLoading]);

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
      {id && <ProjectSyncIndicator projectId={id} feedHealth={syncFeedHealth} />}
    </div>
  );
}
