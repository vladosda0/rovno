import type { AIProposal } from "@/types/ai";
import { can } from "@/lib/permissions";
import {
  getCurrentUser, getMembers, getProject, getStages,
  addTask, addEvent, addProcurementItem, addDocument,
  updateEstimateItems, deductCredit,
  addStage, updateProject,
} from "@/data/store";
import { createWorkspaceProject, type WorkspaceMode } from "@/data/workspace-source";
import type { AIAccess, MemberRole, Project, User } from "@/types/entities";

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
  projectId?: string;
  createdProject?: Project;
}

export interface CommitProposalOptions {
  actor?: {
    currentUser: User;
    role?: MemberRole | null;
    aiAccess?: AIAccess;
  };
  workspaceMode: WorkspaceMode;
  defaultProjectMode?: Project["project_mode"];
  eventSource?: "ai" | "user";
  eventActorId?: string;
  emitProposalEvent?: boolean;
}

function buildPayloadWithSource(payload: Record<string, unknown>, source?: "ai" | "user") {
  return source ? { ...payload, source } : payload;
}

export async function commitProposal(proposal: AIProposal, options: CommitProposalOptions): Promise<CommitResult> {
  // Handle create_project specially — no existing project context needed
  if (proposal.type === "create_project") {
    return commitProjectProposal(proposal, options);
  }

  const user = options.actor?.currentUser ?? getCurrentUser();
  const members = getMembers(proposal.project_id);
  const membership = members.find((m) => m.user_id === user.id);
  const role: MemberRole = options.actor?.role ?? membership?.role ?? "viewer";
  const aiAccess: AIAccess = options.actor?.aiAccess ?? membership?.ai_access ?? "none";

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
  const eventActorId = options.eventActorId ?? (options.eventSource === "ai" ? "ai" : user.id);

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
          created_at: new Date().toISOString(),
        }, {
          actorId: eventActorId,
          source: options.eventSource,
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
        const procurementEvtId = `evt-proc-ai-${Date.now()}-${count}`;
        addEvent({
          id: procurementEvtId,
          project_id: pid,
          actor_id: eventActorId,
          type: "procurement_created",
          object_type: "procurement_item",
          object_id: itemId,
          timestamp: new Date().toISOString(),
          payload: buildPayloadWithSource({ title: change.label }, options.eventSource),
        });
        eventIds.push(procurementEvtId);
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
        const documentEvtId = `evt-doc-ai-${Date.now()}-${count}`;
        addEvent({
          id: documentEvtId,
          project_id: pid,
          actor_id: eventActorId,
          type: "document_created",
          object_type: "document",
          object_id: docId,
          timestamp: new Date().toISOString(),
          payload: buildPayloadWithSource({ title: change.label }, options.eventSource),
        });
        eventIds.push(documentEvtId);
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
      actor_id: eventActorId,
      type: "estimate_created",
      object_type: "estimate_version",
      object_id: proposal.id,
      timestamp: new Date().toISOString(),
      payload: buildPayloadWithSource({ summary: proposal.summary }, options.eventSource),
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

  if (options.emitProposalEvent !== false) {
    const proposalEvtId = `evt-proposal-${Date.now()}`;
    addEvent({
      id: proposalEvtId,
      project_id: pid,
      actor_id: eventActorId,
      type: "proposal_confirmed",
      object_type: "proposal",
      object_id: proposal.id,
      timestamp: new Date().toISOString(),
      payload: buildPayloadWithSource({ summary: proposal.summary, change_count: count }, options.eventSource),
    });
    eventIds.push(proposalEvtId);
  }

  deductCredit();

  return { success: true, count, eventIds, created, updated };
}

async function commitProjectProposal(proposal: AIProposal, options: CommitProposalOptions): Promise<CommitResult> {
  const user = options.actor?.currentUser ?? getCurrentUser();
  const totalCredits = user.credits_free + user.credits_paid;
  if (totalCredits <= 0) {
    return { success: false, error: "No credits remaining.", eventIds: [], created: [], updated: [] };
  }

  const projectChange = proposal.changes.find((c) => c.entity_type === "project");
  const stageChanges = proposal.changes.filter((c) => c.entity_type === "stage");
  const eventActorId = options.eventActorId ?? (options.eventSource === "ai" ? "ai" : user.id);
  const title = projectChange?.label ?? "New Project";

  let createdProject: Project;
  try {
    createdProject = await createWorkspaceProject(
      options.workspaceMode,
      {
        title,
        type: projectChange?.after ?? "residential",
        projectMode: options.defaultProjectMode ?? "contractor",
        ownerId: user.id,
      },
      {
        bootstrapLocalProject: false,
      },
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to create project.",
      eventIds: [],
      created: [],
      updated: [],
    };
  }

  const projectId = createdProject.id;

  const created: CommitResultItem[] = [
    { type: "project", id: projectId, label: title, route: `/project/${projectId}/dashboard` },
  ];

  const eventIds: string[] = [];

  if (options.workspaceMode.kind !== "supabase") {
    let firstStageId = "";
    stageChanges.forEach((sc, i) => {
      const stageId = `stage-ai-${Date.now()}-${i}`;
      if (i === 0) {
        firstStageId = stageId;
      }
      addStage({
        id: stageId,
        project_id: projectId,
        title: sc.label,
        description: "",
        order: i + 1,
        status: "open",
      });
      created.push({ type: "stage", id: stageId, label: sc.label, route: `/project/${projectId}/tasks` });
    });

    updateProject(projectId, {
      automation_level: "full",
      current_stage_id: firstStageId,
    });
    createdProject = {
      ...createdProject,
      automation_level: "full",
      current_stage_id: firstStageId,
    };

    const evtId = `evt-proj-${Date.now()}`;
    addEvent({
      id: evtId,
      project_id: projectId,
      actor_id: eventActorId,
      type: "project_created",
      object_type: "project",
      object_id: projectId,
      timestamp: new Date().toISOString(),
      payload: buildPayloadWithSource({ title, stages: stageChanges.length }, options.eventSource),
    });
    eventIds.push(evtId);
  }

  deductCredit();

  return {
    success: true,
    count: created.length,
    eventIds,
    created,
    updated: [],
    projectId,
    createdProject,
  };
}
