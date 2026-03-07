import { Outlet, Navigate, useParams, useLocation } from "react-router-dom";
import { isAuthenticated, isDemoSessionActive } from "@/lib/auth-state";

export default function ProjectLayout() {
  const { id } = useParams();
  const location = useLocation();

  if (!isAuthenticated() && !isDemoSessionActive()) {
    return <Navigate to="/#demos" replace />;
  }

  // Redirect /project/:id to /project/:id/dashboard
  if (location.pathname === `/project/${id}`) {
    return <Navigate to={`/project/${id}/dashboard`} replace />;
  }

  return (
    <div className="flex flex-col">
      <div className="flex-1 p-sp-3">
        <Outlet />
      </div>
    </div>
  );
}
