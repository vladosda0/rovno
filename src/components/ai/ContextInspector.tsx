import { useTranslation } from "react-i18next";
import { useCurrentUser, useEvents } from "@/hooks/use-mock-data";
import { getProject, getStages, getTasks } from "@/data/store";
import { useEstimateV2FinanceProjectSummaryFromWorkspace } from "@/hooks/use-estimate-v2-data";
import { useWorkspaceProjectMembers } from "@/hooks/use-workspace-source";
import { getProjectDomainAccess, projectDomainAllowsView, usePermission } from "@/lib/permissions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProcurementReadProjectSummary } from "@/hooks/use-procurement-read-model";
import { buildAIProjectContext } from "@/lib/ai-project-context";

interface ContextInspectorProps {
  projectId: string;
}

export function ContextInspector({ projectId }: ContextInspectorProps) {
  const { t } = useTranslation();
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

  const pack = buildAIProjectContext(perm.seam, {
    project,
    stages,
    tasks,
    financeSummary,
    procurementSummary,
    events,
    memberCount: members.length,
    userCredits: user.credits_free + user.credits_paid,
  });

  return (
    <div className="glass rounded-card p-2.5 text-[10px] font-mono">
      <div className="flex items-center gap-1 mb-1">
        <span className="text-caption font-semibold text-muted-foreground">{t("ai.contextInspector.title")}</span>
        <span className="text-[10px] text-accent bg-accent/10 rounded-pill px-1.5">{t("ai.contextInspector.devBadge")}</span>
      </div>
      <ScrollArea className="max-h-48">
        <pre className="text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(pack, null, 1)}
        </pre>
      </ScrollArea>
    </div>
  );
}
