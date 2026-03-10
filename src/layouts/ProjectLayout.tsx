import { Outlet, Navigate, useParams, useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { isDemoSessionActive } from "@/lib/auth-state";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useWorkspaceMode, useWorkspaceProjectState } from "@/hooks/use-workspace-source";

export default function ProjectLayout() {
  const { id } = useParams();
  const location = useLocation();
  const runtimeAuth = useRuntimeAuth();
  const workspaceMode = useWorkspaceMode();
  const demoSessionActive = isDemoSessionActive();
  const demoRuntimeActive = demoSessionActive && runtimeAuth.status !== "authenticated";
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(id ?? "");

  if (runtimeAuth.status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading project...
      </div>
    );
  }

  if (!demoRuntimeActive && runtimeAuth.status === "guest") {
    return <Navigate to="/auth/login" replace />;
  }

  // Redirect /project/:id to /project/:id/dashboard
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/dashboard`} replace />;
  }

  if (!demoRuntimeActive && workspaceMode.kind === "pending-supabase") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading project...
      </div>
    );
  }

  if (
    !demoRuntimeActive
    && runtimeAuth.status === "authenticated"
    && workspaceMode.kind === "supabase"
    && !isProjectLoading
    && !project
  ) {
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
