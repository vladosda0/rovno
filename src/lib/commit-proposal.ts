import type { AIProposal } from "@/types/ai";
import { can } from "@/lib/permissions";
import {
  getCurrentUser, getMembers, getProject, getStages,
  addTask, addEvent, addProcurementItem, addDocument,
  updateEstimateItems, deductCredit,
} from "@/data/store";
import type { MemberRole, AIAccess } from "@/types/entities";

export interface CommitResultItem {
  type: string;
  id: string;
  label: string;
  route?: string;
  meta?: string;
}

export interface CommitResult {
  success: boolean;
  error?: string;
  count?: number;
  eventIds: string[];
  created: CommitResultItem[];
  updated: CommitResultItem[];
}

export function commitProposal(proposal: AIProposal): CommitResult {
  const user = getCurrentUser();
  const members = getMembers(proposal.project_id);
  const membership = members.find((m) => m.user_id === user.id);
  const role: MemberRole = membership?.role ?? "participant";
  const aiAccess: AIAccess = membership?.ai_access ?? "none";

  if (!can(role, "ai.generate", aiAccess)) {
    return { success: false, error: "You don't have permission to use AI generation.", eventIds: [], created: [], updated: [] };
  }

  const totalCredits = user.credits_free + user.credits_paid;
  if (totalCredits <= 0) {
    return { success: false, error: "No credits remaining. Upgrade your plan.", eventIds: [], created: [], updated: [] };
  }

  const project = getProject(proposal.project_id);
  const stages = getStages(proposal.project_id);
  const currentStage = stages.find((s) => s.id === project?.current_stage_id) ?? stages[0];

  let count = 0;
  const eventIds: string[] = [];
  const created: CommitResultItem[] = [];
  const updated: CommitResultItem[] = [];
  const pid = proposal.project_id;

  if (proposal.type === "add_task") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "task") {
        const taskId = `task-ai-${Date.now()}-${count}`;
        addTask({
          id: taskId,
          project_id: pid,
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
        created.push({
          type: "task",
          id: taskId,
          label: change.label,
          route: `/project/${pid}/tasks`,
        });
        count++;
      }
    }
  }

  if (proposal.type === "add_procurement") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "procurement_item") {
        const itemId = `proc-ai-${Date.now()}-${count}`;
        addProcurementItem({
          id: itemId,
          project_id: pid,
          stage_id: currentStage?.id,
          title: change.label,
          unit: "pcs",
          qty: 1,
          in_stock: 0,
          cost: parseInt(change.after?.replace(/[^\d]/g, "") ?? "0"),
          status: "not_purchased",
        });
        created.push({
          type: "procurement_item",
          id: itemId,
          label: change.label,
          route: `/project/${pid}/procurement`,
        });
        count++;
      }
    }
  }

  if (proposal.type === "generate_document") {
    for (const change of proposal.changes) {
      if (change.action === "create" && change.entity_type === "document") {
        const docId = `doc-ai-${Date.now()}-${count}`;
        addDocument({
          id: docId,
          project_id: pid,
          type: "contract",
          title: change.label,
          versions: [{
            id: `dv-ai-${Date.now()}-${count}`,
            document_id: docId,
            number: 1,
            status: "draft",
            content: `AI-generated draft for ${change.label}`,
          }],
        });
        created.push({
          type: "document",
          id: docId,
          label: change.label,
          route: `/project/${pid}/documents`,
        });
        count++;
      }
    }
  }

  if (proposal.type === "update_estimate") {
    const evtId = `evt-ai-${Date.now()}`;
    addEvent({
      id: evtId,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_created",
      object_type: "estimate_version",
      object_id: proposal.id,
      timestamp: new Date().toISOString(),
      payload: { summary: proposal.summary },
    });
    eventIds.push(evtId);
    for (const change of proposal.changes) {
      (change.action === "create" ? created : updated).push({
        type: "estimate_version",
        id: proposal.id,
        label: change.label,
        route: `/project/${pid}/estimate`,
        meta: change.after,
      });
    }
    count = proposal.changes.length;
  }

  const proposalEvtId = `evt-proposal-${Date.now()}`;
  addEvent({
    id: proposalEvtId,
    project_id: pid,
    actor_id: user.id,
    type: "proposal_confirmed",
    object_type: "proposal",
    object_id: proposal.id,
    timestamp: new Date().toISOString(),
    payload: { summary: proposal.summary, change_count: count },
  });
  eventIds.push(proposalEvtId);

  deductCredit();

  return { success: true, count, eventIds, created, updated };
}
