import { useCurrentUser, useEvents } from "@/hooks/use-mock-data";
import { getProject, getStages, getTasks } from "@/data/store";
import { useEstimateV2FinanceProjectSummaryFromWorkspace } from "@/hooks/use-estimate-v2-data";
import { useWorkspaceProjectMembers } from "@/hooks/use-workspace-source";
import { getProjectDomainAccess, projectDomainAllowsView, usePermission } from "@/lib/permissions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProcurementReadProjectSummary } from "@/hooks/use-procurement-read-model";

interface ContextInspectorProps {
  projectId: string;
}

export function ContextInspector({ projectId }: ContextInspectorProps) {
  const user = useCurrentUser();
  const project = getProject(projectId);
  const stages = getStages(projectId);
  const tasks = getTasks(projectId);
  const procurementSummary = useProcurementReadProjectSummary(projectId);
  const events = useEvents(projectId).slice(0, 5);
  const members = useWorkspaceProjectMembers(projectId);
  const perm = usePermission(projectId);
  const hrReadsEnabled = projectDomainAllowsView(getProjectDomainAccess(perm.seam, "hr"));
  const financeSummary = useEstimateV2FinanceProjectSummaryFromWorkspace(projectId, project ?? null, {
    hrReadsEnabled,
  });

  if (!project) return null;

  const pack = {
    project: { title: project.title, type: project.type, progress: `${project.progress_pct}%` },
    stages: stages.map((s) => ({ title: s.title, status: s.status })),
    tasks: { total: tasks.length, done: tasks.filter((t) => t.status === "done").length, blocked: tasks.filter((t) => t.status === "blocked").length },
    estimate: {
      hasEstimate: financeSummary?.hasEstimate ?? false,
      current: financeSummary?.status ?? null,
      stages: financeSummary?.stageCount ?? 0,
      lines: financeSummary?.lineCount ?? 0,
    },
    procurement: {
      total: procurementSummary?.totalCount ?? 0,
      requested: procurementSummary?.requestedCount ?? 0,
      ordered: procurementSummary?.orderedCount ?? 0,
      inStock: procurementSummary?.inStockCount ?? 0,
      inStockActual: procurementSummary?.inStockActualTotal ?? 0,
    },
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
