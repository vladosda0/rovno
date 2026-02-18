import { useParams, Link } from "react-router-dom";
import { useProject, useTasks, useEvents, useEstimate, useProcurement, useDocuments, useMedia } from "@/hooks/use-mock-data";
import { getUserById } from "@/data/store";
import { Progress } from "@/components/ui/progress";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ListTodo, Calculator, ShoppingCart,
  Image, FileText, Activity, Users, Plus, ArrowRight,
  CheckCircle2, Circle, Clock, AlertTriangle, Camera, Upload
} from "lucide-react";

const taskStatusIcon: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: AlertTriangle,
};

const taskStatusColor: Record<string, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-info",
  done: "text-success",
  blocked: "text-destructive",
};

const stageStatusLabel: Record<string, string> = {
  open: "In progress",
  completed: "Done",
  archived: "Archived",
};

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const { project, stages, members } = useProject(id!);
  const tasks = useTasks(id!);
  const events = useEvents(id!);
  const estimate = useEstimate(id!);
  const procurement = useProcurement(id!);
  const documents = useDocuments(id!);
  const media = useMedia(id!);

  if (!project) {
    return (
      <EmptyState
        icon={LayoutDashboard}
        title="Project not found"
        description="This project does not exist."
      />
    );
  }

  const recentEvents = events.slice(0, 4);
  const recentTasks = tasks.slice(0, 5);
  const activeVersion = estimate?.versions.find(v => v.status === "approved") ?? estimate?.versions[0];
  const totalPlanned = activeVersion?.items.reduce((s, i) => s + i.planned_cost, 0) ?? 0;
  const totalPaid = activeVersion?.items.reduce((s, i) => s + i.paid_cost, 0) ?? 0;
  const purchasedCount = procurement.filter(p => p.status === "purchased").length;

  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const blockedTasks = tasks.filter(t => t.status === "blocked").length;

  return (
    <div className="space-y-sp-3">
      {/* Header Card */}
      <div className="glass rounded-card p-sp-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-h2 text-foreground">{project.title}</h2>
            <p className="text-body-sm text-muted-foreground mt-1 capitalize">{project.type} · {project.automation_level} automation</p>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <Progress value={project.progress_pct} className="h-2.5 flex-1" />
            <span className="text-body font-semibold text-foreground whitespace-nowrap">{project.progress_pct}%</span>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sp-2 mt-sp-3">
          <div className="rounded-panel bg-muted/50 p-sp-2 text-center">
            <p className="text-h3 text-foreground font-bold">{tasks.length}</p>
            <p className="text-caption text-muted-foreground">Total Tasks</p>
          </div>
          <div className="rounded-panel bg-success/10 p-sp-2 text-center">
            <p className="text-h3 text-success font-bold">{doneTasks}</p>
            <p className="text-caption text-muted-foreground">Completed</p>
          </div>
          <div className="rounded-panel bg-info/10 p-sp-2 text-center">
            <p className="text-h3 text-info font-bold">{inProgressTasks}</p>
            <p className="text-caption text-muted-foreground">In Progress</p>
          </div>
          <div className="rounded-panel bg-destructive/10 p-sp-2 text-center">
            <p className="text-h3 text-destructive font-bold">{blockedTasks}</p>
            <p className="text-caption text-muted-foreground">Blocked</p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-sp-2">

        {/* Stages card */}
        <div className="glass rounded-card p-sp-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 text-accent" /> Stages
            </h3>
            <span className="text-caption text-muted-foreground">{stages.length} total</span>
          </div>
          {stages.length > 0 ? (
            <div className="space-y-2">
              {stages.map((s) => {
                const stageTasks = tasks.filter(t => t.stage_id === s.id);
                const done = stageTasks.filter(t => t.status === "done").length;
                const pct = stageTasks.length > 0 ? Math.round((done / stageTasks.length) * 100) : 0;
                return (
                  <div key={s.id} className="rounded-panel bg-muted/40 p-sp-1 px-sp-2">
                    <div className="flex items-center justify-between">
                      <span className="text-body-sm font-medium text-foreground">{s.title}</span>
                      <StatusBadge status={stageStatusLabel[s.status] ?? s.status} variant="task" />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={pct} className="h-1 flex-1" />
                      <span className="text-caption text-muted-foreground">{done}/{stageTasks.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No stages defined yet</p>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add Stage</Button>
            </div>
          )}
        </div>

        {/* Tasks card */}
        <div className="glass rounded-card p-sp-2 lg:col-span-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-accent" /> Recent Tasks
            </h3>
            <Link to={`/project/${id}/tasks`} className="text-caption text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentTasks.length > 0 ? (
            <div className="space-y-1.5">
              {recentTasks.map((t) => {
                const Icon = taskStatusIcon[t.status] ?? Circle;
                const color = taskStatusColor[t.status] ?? "text-muted-foreground";
                const assignee = getUserById(t.assignee_id);
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-2 px-sp-2 hover:bg-muted/60 transition-colors cursor-pointer">
                    <Icon className={`h-4 w-4 ${color} shrink-0`} />
                    <span className="text-body-sm text-foreground flex-1 truncate">{t.title}</span>
                    {assignee && (
                      <span className="text-caption text-muted-foreground truncate max-w-[100px]">{assignee.name.split(" ")[0]}</span>
                    )}
                    <StatusBadge status={t.status.replace(/_/g, " ")} variant="task" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No tasks yet</p>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-3 w-3 mr-1" /> Create Task</Button>
            </div>
          )}
        </div>

        {/* Estimate card */}
        <div className="glass rounded-card p-sp-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <Calculator className="h-4 w-4 text-accent" /> Estimate
            </h3>
            <Link to={`/project/${id}/estimate`} className="text-caption text-accent hover:underline flex items-center gap-1">
              Details <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {activeVersion ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={activeVersion.status} variant="estimate" />
                <span className="text-caption text-muted-foreground">v{activeVersion.number} · {activeVersion.items.length} items</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-panel bg-muted/40 p-2 text-center">
                  <p className="text-body-sm font-semibold text-foreground">₽{(totalPlanned / 1000).toFixed(0)}K</p>
                  <p className="text-caption text-muted-foreground">Planned</p>
                </div>
                <div className="rounded-panel bg-muted/40 p-2 text-center">
                  <p className="text-body-sm font-semibold text-foreground">₽{(totalPaid / 1000).toFixed(0)}K</p>
                  <p className="text-caption text-muted-foreground">Paid</p>
                </div>
              </div>
              {totalPlanned > 0 && (
                <div className="mt-2">
                  <Progress value={Math.round((totalPaid / totalPlanned) * 100)} className="h-1.5" />
                  <p className="text-caption text-muted-foreground mt-1">{Math.round((totalPaid / totalPlanned) * 100)}% spent</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No estimate created</p>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-3 w-3 mr-1" /> Create Estimate</Button>
            </div>
          )}
        </div>

        {/* Procurement card */}
        <div className="glass rounded-card p-sp-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-accent" /> Procurement
            </h3>
            <Link to={`/project/${id}/procurement`} className="text-caption text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {procurement.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-body-sm text-foreground font-medium">{purchasedCount}/{procurement.length} purchased</span>
              </div>
              <div className="space-y-1.5">
                {procurement.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-panel bg-muted/40 p-1.5 px-sp-2">
                    <span className="text-caption text-foreground truncate flex-1">{p.title}</span>
                    <StatusBadge status={p.status === "purchased" ? "Purchased" : "Not purchased"} variant="procurement" />
                  </div>
                ))}
                {procurement.length > 3 && (
                  <p className="text-caption text-muted-foreground text-center">+{procurement.length - 3} more items</p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No procurement items</p>
              <Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" /> Add Item</Button>
            </div>
          )}
        </div>

        {/* Participants card */}
        <div className="glass rounded-card p-sp-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" /> Participants
            </h3>
            <Link to={`/project/${id}/participants`} className="text-caption text-accent hover:underline flex items-center gap-1">
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {members.length > 0 ? (
            <div className="space-y-1.5">
              {members.map((m) => {
                const user = getUserById(m.user_id);
                return (
                  <div key={m.user_id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
                    <div className="h-7 w-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                      <span className="text-caption font-semibold text-accent">{user?.name?.charAt(0) ?? "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-foreground truncate">{user?.name ?? "Unknown"}</p>
                      <p className="text-caption text-muted-foreground capitalize">{m.role}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No participants added</p>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-3 w-3 mr-1" /> Invite Member</Button>
            </div>
          )}
        </div>

        {/* Gallery card */}
        <div className="glass rounded-card p-sp-2 lg:col-span-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <Image className="h-4 w-4 text-accent" /> Gallery
            </h3>
            <Link to={`/project/${id}/gallery`} className="text-caption text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {media.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {media.slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-panel bg-muted/40 aspect-[4/3] flex flex-col items-center justify-center p-2 hover:bg-muted/60 transition-colors cursor-pointer">
                  <Camera className="h-6 w-6 text-muted-foreground mb-1" />
                  <p className="text-caption text-muted-foreground text-center line-clamp-2">{m.caption}</p>
                  {m.is_final && (
                    <span className="mt-1 text-[10px] bg-success/15 text-success rounded-pill px-1.5 py-0.5 font-medium">Final</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <Camera className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-body-sm text-muted-foreground mb-2">No photos yet</p>
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90"><Upload className="h-3 w-3 mr-1" /> Upload Photos</Button>
            </div>
          )}
        </div>

        {/* Documents card */}
        <div className="glass rounded-card p-sp-2">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" /> Documents
            </h3>
            <Link to={`/project/${id}/documents`} className="text-caption text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {documents.length > 0 ? (
            <div className="space-y-1.5">
              {documents.map((d) => {
                const latestVersion = d.versions[d.versions.length - 1];
                return (
                  <div key={d.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2 hover:bg-muted/60 transition-colors cursor-pointer">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-foreground truncate">{d.title}</p>
                      <p className="text-caption text-muted-foreground capitalize">{d.type} · v{latestVersion?.number}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground mb-2">No documents yet</p>
              <Button size="sm" variant="outline"><Upload className="h-3 w-3 mr-1" /> Upload Document</Button>
            </div>
          )}
        </div>

        {/* Activity card - full width */}
        <div className="glass rounded-card p-sp-2 lg:col-span-3">
          <div className="flex items-center justify-between mb-sp-2">
            <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" /> Recent Activity
            </h3>
            <Link to={`/project/${id}/activity`} className="text-caption text-accent hover:underline flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {recentEvents.map((evt) => {
                const actor = getUserById(evt.actor_id);
                const payload = evt.payload as Record<string, unknown>;
                return (
                  <div key={evt.id} className="flex items-start gap-2 rounded-panel bg-muted/40 p-2 px-sp-2">
                    <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[10px] font-semibold text-accent">{actor?.name?.charAt(0) ?? "?"}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm text-foreground">
                        <span className="font-medium">{actor?.name ?? "Unknown"}</span>{" "}
                        <span className="text-muted-foreground">{evt.type.replace(/_/g, " ")}</span>
                      </p>
                      {(payload.title || payload.caption || payload.name) && (
                        <p className="text-caption text-muted-foreground truncate">
                          {String(payload.title ?? payload.caption ?? payload.name)}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(evt.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-sp-3">
              <p className="text-body-sm text-muted-foreground">No activity recorded yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
