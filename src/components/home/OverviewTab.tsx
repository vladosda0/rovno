import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Plus, FileText, Upload, CreditCard, AlertTriangle,
  Clock, CheckCircle2, FolderOpen,
} from "lucide-react";
import { useProjects, useCurrentUser } from "@/hooks/use-mock-data";
import { useProjectsRecentEventsMap } from "@/hooks/use-activity-source";
import * as store from "@/data/store";
import { PendingInvitationsBlock } from "@/components/home/PendingInvitationsBlock";
import { useWorkspaceProjectsSensitiveDetailMap } from "@/hooks/use-home-sensitive-detail-map";
import { getActivityDisplayDetailForHome } from "@/lib/activity-display";

function getStatusColor(progress: number): string {
  if (progress >= 100) return "bg-success/15 text-success";
  if (progress > 0) return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}
function getStatusText(progress: number): string {
  if (progress >= 100) return "Done";
  if (progress > 0) return "In progress";
  return "Draft";
}

export function OverviewTab() {
  const navigate = useNavigate();
  const projects = useProjects();
  const user = useCurrentUser();
  const allTasks = store.getAllTasks();
  const totalCredits = user.credits_free + user.credits_paid;

  const upcomingTasks = allTasks
    .filter((t) => t.status === "in_progress" || t.status === "not_started")
    .slice(0, 6);

  const overdueTasks = allTasks.filter((t) => {
    if (!t.deadline || t.status === "done") return false;
    return new Date(t.deadline) < new Date();
  });

  const recentProjects = [...projects]
    .sort((a, b) => b.progress_pct - a.progress_pct)
    .slice(0, 5);
  const recentActivityByProject = useProjectsRecentEventsMap(
    projects.slice(0, 3).map((project) => project.id),
    2,
  );
  const { canViewSensitiveDetailByProjectId } = useWorkspaceProjectsSensitiveDetailMap();
  const activityRedactionByProject = useMemo(() => {
    const record: Record<string, { canViewFinanceDetail: boolean }> = {};
    for (const [pid, canView] of canViewSensitiveDetailByProjectId) {
      record[pid] = { canViewFinanceDetail: canView };
    }
    return record;
  }, [canViewSensitiveDetailByProjectId]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => navigate("/home?tab=projects")}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Create project
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/home?tab=tasks")}>
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> New task
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/home?tab=documents")}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload document
        </Button>
        <Button size="sm" variant="outline" onClick={() => navigate("/settings?tab=billing")}>
          <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Billing
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-4 sm:space-y-6">
          <PendingInvitationsBlock />

          {/* My Projects */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-accent" /> My Projects
                </h3>
                <Button variant="ghost" size="sm" className="text-caption" onClick={() => navigate("/home?tab=projects")}>
                  View all
                </Button>
              </div>
              <div className="space-y-2">
                {recentProjects.map((p) => (
                  <Link
                    key={p.id}
                    to={`/project/${p.id}/dashboard`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-foreground truncate">{p.title}</p>
                      <Progress value={p.progress_pct} className="h-1 mt-1" />
                    </div>
                    <span className={`text-caption font-medium px-2 py-0.5 rounded-pill shrink-0 ${getStatusColor(p.progress_pct)}`}>
                      {getStatusText(p.progress_pct)}
                    </span>
                  </Link>
                ))}
                {recentProjects.length === 0 && (
                  <p className="text-caption text-muted-foreground py-4 text-center">No projects yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Tasks */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between sm:mb-4">
                <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-info" /> Upcoming Tasks
                </h3>
                <Button variant="ghost" size="sm" className="text-caption" onClick={() => navigate("/home?tab=tasks")}>
                  View all
                </Button>
              </div>
              <div className="space-y-1.5">
                {upcomingTasks.map((t) => {
                  const project = store.getProject(t.project_id);
                  return (
                    <Link
                      key={t.id}
                      to={`/project/${t.project_id}/tasks`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-foreground truncate">{t.title}</p>
                        <p className="text-caption text-muted-foreground truncate">{project?.title}</p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {t.status === "in_progress" ? "Active" : "Pending"}
                      </Badge>
                    </Link>
                  );
                })}
                {upcomingTasks.length === 0 && (
                  <p className="text-caption text-muted-foreground py-4 text-center">No upcoming tasks</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Overdue */}
          {overdueTasks.length > 0 && (
            <Card className="border-destructive/30">
              <CardContent className="p-4 sm:p-6">
                <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-destructive sm:mb-4">
                  <AlertTriangle className="h-4 w-4" /> Overdue Tasks
                </h3>
                <div className="space-y-1.5">
                  {overdueTasks.slice(0, 5).map((t) => (
                    <Link
                      key={t.id}
                      to={`/project/${t.project_id}/tasks`}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-destructive/5 transition-colors"
                    >
                      <p className="text-body-sm text-foreground truncate flex-1">{t.title}</p>
                      <span className="text-caption text-destructive shrink-0">
                        {t.deadline ? new Date(t.deadline).toLocaleDateString() : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4 sm:space-y-6">
          {/* Credits */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h3 className="mb-3 text-body font-semibold text-foreground sm:mb-4">Credits</h3>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-h3 font-bold text-foreground">{totalCredits}</span>
                <span className="text-caption text-muted-foreground">remaining</span>
              </div>
              <p className="mb-3 text-caption text-muted-foreground sm:mb-4">
                {user.credits_free} daily · {user.credits_paid} paid
              </p>
              {totalCredits === 0 && (
                <div className="p-2 rounded-lg bg-destructive/10 text-destructive text-caption mb-2">
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  No credits remaining. Upgrade your plan.
                </div>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/settings?tab=billing")}>
                <CreditCard className="h-3.5 w-3.5 mr-1.5" /> Manage billing
              </Button>
            </CardContent>
          </Card>

          {/* Documents needing attention */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground sm:mb-4">
                <FileText className="h-4 w-4 text-warning" /> Documents
              </h3>
              <p className="text-caption text-muted-foreground py-4 text-center">
                No documents need attention right now.
              </p>
            </CardContent>
          </Card>

          {/* Inventory alerts */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h3 className="mb-3 text-body font-semibold text-foreground sm:mb-4">Inventory Alerts</h3>
              <p className="text-caption text-muted-foreground py-4 text-center">
                No low-stock alerts.
              </p>
            </CardContent>
          </Card>

          {/* Recent activity */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h3 className="mb-3 text-body font-semibold text-foreground sm:mb-4">Recent Activity</h3>
              <div className="space-y-1.5">
                {projects.slice(0, 3).map((p) => {
                  const events = recentActivityByProject[p.id] ?? [];
                  return events.map((evt) => {
                    const line = getActivityDisplayDetailForHome(evt, activityRedactionByProject, {
                      canViewFinanceDetail: true,
                    });
                    const summary = line ?? evt.type.replace(/[._]/g, " ");
                    return (
                      <div key={evt.id} className="flex items-center gap-2 p-1.5 text-caption text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                        <span className="truncate">{summary} — {p.title}</span>
                      </div>
                    );
                  });
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
