import { Outlet, Navigate, useParams, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspaceMode, useWorkspaceProjectState } from "@/hooks/use-workspace-source";
import { usePermission } from "@/lib/permissions";

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
  const { id } = useParams();
  const location = useLocation();
  const workspaceMode = useWorkspaceMode();
  const perm = usePermission(id ?? "");
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(id ?? "");

  // Redirect /project/:id to /project/:id/dashboard
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/dashboard`} replace />;
  }

  if (workspaceMode.kind === "guest") {
    return <Navigate to="/auth/login" replace />;
  }

  if (workspaceMode.kind === "pending-supabase" || (workspaceMode.kind === "supabase" && isProjectLoading)) {
    return <ProjectLayoutSkeleton />;
  }

  if (workspaceMode.kind === "supabase" && !project) {
    return (
      <div className="flex-1 p-sp-3">
        <EmptyState
          icon={AlertTriangle}
          title="Project not found"
          description="This project does not exist."
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
