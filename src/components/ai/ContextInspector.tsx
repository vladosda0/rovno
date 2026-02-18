import { useCurrentUser } from "@/hooks/use-mock-data";
import { getProject, getStages, getTasks, getEstimate, getProcurementItems, getEvents, getMembers } from "@/data/store";
import { usePermission } from "@/lib/permissions";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ContextInspectorProps {
  projectId: string;
}

export function ContextInspector({ projectId }: ContextInspectorProps) {
  const user = useCurrentUser();
  const project = getProject(projectId);
  const stages = getStages(projectId);
  const tasks = getTasks(projectId);
  const estimate = getEstimate(projectId);
  const procurement = getProcurementItems(projectId);
  const events = getEvents(projectId).slice(0, 5);
  const members = getMembers(projectId);
  const perm = usePermission(projectId);

  if (!project) return null;

  const pack = {
    project: { title: project.title, type: project.type, progress: `${project.progress_pct}%` },
    stages: stages.map((s) => ({ title: s.title, status: s.status })),
    tasks: { total: tasks.length, done: tasks.filter((t) => t.status === "done").length, blocked: tasks.filter((t) => t.status === "blocked").length },
    estimate: { versions: estimate?.versions.length ?? 0, current: estimate?.versions[estimate.versions.length - 1]?.status },
    procurement: { total: procurement.length, purchased: procurement.filter((p) => p.status === "purchased").length },
    user: { role: perm.role, credits: user.credits_free + user.credits_paid },
    members: members.length,
    recentEvents: events.map((e) => ({ type: e.type, time: new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })),
  };

  return (
    <div className="glass rounded-card p-2.5 text-[10px] font-mono">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-caption font-semibold text-muted-foreground">Context Pack</span>
        <span className="text-[10px] text-accent bg-accent/10 rounded-pill px-1.5">DEV</span>
      </div>
      <ScrollArea className="max-h-48">
        <pre className="text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(pack, null, 1)}
        </pre>
      </ScrollArea>
    </div>
  );
}