import type { AIProposal } from "@/types/ai";
import { can } from "@/lib/permissions";
import {
  getCurrentUser, getMembers, getProject, getStages,
  addTask, addEvent, addProcurementItem, addDocument,
  updateEstimateItems, deductCredit,
} from "@/data/store";
import type { MemberRole, AIAccess } from "@/types/entities";

export function commitProposal(proposal: AIProposal): { success: boolean; error?: string; count?: number } {
  const user = getCurrentUser();
  const members = getMembers(proposal.project_id);
  const membership = members.find((m) => m.user_id === user.id);
  const role: MemberRole = membership?.role ?? "participant";
  const aiAccess: AIAccess = membership?.ai_access ?? "none";

  if (!can(role, "ai.generate", aiAccess)) {
    return { success: false, error: "You don't have permission to use AI generation." };
  }

  const totalCredits = user.credits_free + user.credits_paid;
  if (totalCredits <= 0) {
    return { success: false, error: "No credits remaining. Upgrade your plan." };
  }

  const project = getProject(proposal.project_id);
  const stages = getStages(proposal.project_id);
  const currentStage = stages.find((s) => s.id === project?.current_stage_id) ?? stages[0];

  let count = 0;

  if (proposal.type === "add_task") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "task") {
        addTask({
          id: `task-ai-${Date.now()}-${count}`,
          project_id: proposal.project_id,
          stage_id: currentStage?.id ?? "",
          title: change.label,
          description: `AI-generated task for ${currentStage?.title ?? "project"}`,
          status: "not_started",
          assignee_id: user.id,
          checklist: [],
          comments: [],
          attachments: [],
          photos: [],
          linked_estimate_item_ids: [],
        });
        count++;
      }
    }
  }

  if (proposal.type === "add_procurement") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "procurement_item") {
        addProcurementItem({
          id: `proc-ai-${Date.now()}-${count}`,
          project_id: proposal.project_id,
          stage_id: currentStage?.id,
          title: change.label,
          unit: "pcs",
          qty: 1,
          in_stock: 0,
          cost: parseInt(change.after?.replace(/[^\d]/g, "") ?? "0"),
          status: "not_purchased",
        });
        count++;
      }
    }
  }

  if (proposal.type === "generate_document") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "document") {
        addDocument({
          id: `doc-ai-${Date.now()}-${count}`,
          project_id: proposal.project_id,
          type: "contract",
          title: change.label,
          versions: [{
            id: `dv-ai-${Date.now()}-${count}`,
            document_id: `doc-ai-${Date.now()}-${count}`,
            number: 1,
            status: "draft",
            content: `AI-generated draft for ${change.label}`,
          }],
        });
        count++;
      }
    }
  }

  if (proposal.type === "update_estimate") {
    // Log event only for estimate updates
    addEvent({
      id: `evt-ai-${Date.now()}`,
      project_id: proposal.project_id,
      actor_id: user.id,
      type: "estimate_created",
      object_type: "estimate_version",
      object_id: proposal.id,
      timestamp: new Date().toISOString(),
      payload: { summary: proposal.summary },
    });
    count = proposal.changes.length;
  }

  addEvent({
    id: `evt-proposal-${Date.now()}`,
    project_id: proposal.project_id,
    actor_id: user.id,
    type: "proposal_confirmed",
    object_type: "proposal",
    object_id: proposal.id,
    timestamp: new Date().toISOString(),
    payload: { summary: proposal.summary, change_count: count },
  });

  deductCredit();

  return { success: true, count };
}
