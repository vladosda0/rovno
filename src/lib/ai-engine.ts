import type { AIProposal, ProposalChange } from "@/types/ai";
import { getProject, getStages } from "@/data/store";
import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import {
  seamResolveActionState,
  seamEstimateFinanceVisibilityMode,
  type EstimateFinanceVisibilityMode,
} from "@/lib/permissions";
import type { ActionState, ContractDomain, ContractAction } from "@/lib/permission-contract-actions";

type AutomationMode = "full" | "assisted" | "manual" | "observer";

// ---------------------------------------------------------------------------
// Proposal type → contract action mapping
// ---------------------------------------------------------------------------

interface ProposalActionMapping {
  domain: ContractDomain;
  action: ContractAction;
}

const PROPOSAL_TYPE_TO_CONTRACT_ACTION: Record<string, ProposalActionMapping> = {
  add_task:           { domain: "tasks",           action: "manage_tasks" },
  update_estimate:    { domain: "estimate",        action: "edit_estimate_rows" },
  add_procurement:    { domain: "procurement",     action: "order" },
  generate_document:  { domain: "documents_media", action: "upload" },
};

function proposalAllowedForSeam(proposalType: string, seam: ProjectAuthoritySeam | undefined): boolean {
  if (!seam) return true; // no seam = legacy path, allow (commit-proposal will re-check)
  const mapping = PROPOSAL_TYPE_TO_CONTRACT_ACTION[proposalType];
  if (!mapping) return true; // unmapped types pass through (e.g. create_project)
  const state: ActionState = seamResolveActionState(seam, mapping.domain, mapping.action);
  return state === "enabled";
}

// ---------------------------------------------------------------------------
// Monetary copy sanitization
// ---------------------------------------------------------------------------

const MONEY_PATTERN = /[\d,.\s]+[₽$€£¥]/g;

function stripMoney(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.replace(MONEY_PATTERN, "—").trim();
}

function sanitizeProposalCopy(proposal: AIProposal, financeMode: EstimateFinanceVisibilityMode): AIProposal {
  if (financeMode === "detail") return proposal;

  const typeNeedsSanitization =
    proposal.type === "update_estimate" || proposal.type === "add_procurement";
  if (!typeNeedsSanitization) return proposal;

  return {
    ...proposal,
    summary: stripMoney(proposal.summary) ?? proposal.summary,
    changes: proposal.changes.map((change) => ({
      ...change,
      label: stripMoney(change.label) ?? change.label,
      before: stripMoney(change.before),
      after: stripMoney(change.after),
    })),
  };
}

// ---------------------------------------------------------------------------
// Core proposal generation
// ---------------------------------------------------------------------------

function getStageTitle(projectId: string): string | null {
  const project = getProject(projectId);
  if (!project) return null;
  const stages = getStages(projectId);
  const currentStage = stages.find((s) => s.id === project.current_stage_id) ?? stages[0];
  return currentStage?.title ?? "Current stage";
}

function createProjectProposals(input: string, projectId: string): AIProposal[] {
  const lower = input.toLowerCase();
  const stageTitle = getStageTitle(projectId);
  if (!stageTitle) return [];
  const proposals: AIProposal[] = [];

  if (/task|add task|create task/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "task", action: "create", label: `Install junction boxes — ${stageTitle}`, after: "not_started" },
      { entity_type: "task", action: "create", label: `Run conduit for ${stageTitle}`, after: "not_started" },
      { entity_type: "task", action: "create", label: `Inspection sign-off — ${stageTitle}`, after: "not_started" },
    ];
    proposals.push({
      id: `proposal-${Date.now()}`,
      project_id: projectId,
      type: "add_task",
      summary: `Add 3 tasks for "${stageTitle}"`,
      changes,
      status: "pending",
    });
  }

  if (/estimate|cost|budget/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "estimate_item", action: "update", label: "Electrical rough-in", before: "48,000 ₽", after: "52,000 ₽" },
      { entity_type: "estimate_item", action: "create", label: "Additional outlet points ×6", after: "12,000 ₽" },
    ];
    proposals.push({
      id: `proposal-${Date.now()}-estimate`,
      project_id: projectId,
      type: "update_estimate",
      summary: "Update estimate — adjust electrical costs",
      changes,
      status: "pending",
    });
  }

  if (/procurement|buy|purchase|material/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "procurement_item", action: "create", label: "LED panel lights 60×60 ×12", after: "18,000 ₽" },
      { entity_type: "procurement_item", action: "create", label: "Cable tray 2m sections ×8", after: "6,400 ₽" },
    ];
    proposals.push({
      id: `proposal-${Date.now()}-proc`,
      project_id: projectId,
      type: "add_procurement",
      summary: "Add 2 procurement items",
      changes,
      status: "pending",
    });
  }

  if (/document|contract|generate|report/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "document", action: "create", label: `Subcontractor Agreement — ${stageTitle}`, after: "Draft v1" },
    ];
    proposals.push({
      id: `proposal-${Date.now()}-doc`,
      project_id: projectId,
      type: "generate_document",
      summary: "Generate subcontractor agreement draft",
      changes,
      status: "pending",
    });
  }

  return proposals;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateProposal(input: string, projectId: string): AIProposal | null {
  const proposals = createProjectProposals(input, projectId);
  return proposals[0] ?? null;
}

export function generateProposalQueue(
  input: string,
  projectId: string,
  automationMode: string,
  seam?: ProjectAuthoritySeam,
): AIProposal[] {
  const normalizedMode: AutomationMode =
    automationMode === "full" || automationMode === "manual" || automationMode === "observer"
      ? automationMode
      : "assisted";

  let proposals = createProjectProposals(input, projectId);

  // Gate: only include proposals for actions the user's role can execute
  proposals = proposals.filter((p) => proposalAllowedForSeam(p.type, seam));

  // Sanitize monetary copy for non-detail finance visibility
  if (seam) {
    const financeMode = seamEstimateFinanceVisibilityMode(seam);
    proposals = proposals.map((p) => sanitizeProposalCopy(p, financeMode));
  }

  if (proposals.length <= 1) return proposals;

  // Keep queue path active for all levels; L1/L2 autonomy tuning can be expanded later.
  if (normalizedMode === "full") return proposals;
  if (normalizedMode === "assisted") return proposals;
  if (normalizedMode === "manual") return proposals;
  return proposals;
}

export function reviseProposalWithEdits(proposal: AIProposal, edits: string): AIProposal {
  const trimmedEdits = edits.trim();
  if (!trimmedEdits) {
    return {
      ...proposal,
      id: `proposal-${Date.now()}-rev`,
      status: "pending",
    };
  }

  return {
    ...proposal,
    id: `proposal-${Date.now()}-rev`,
    status: "pending",
    summary: `${proposal.summary} (revised)`,
    changes: proposal.changes.map((change, idx) => ({
      ...change,
      label: idx === 0 ? `${change.label} — ${trimmedEdits}` : change.label,
    })),
  };
}

/* --- Global (non-project) proposals --- */

interface ProjectTemplate {
  name: string;
  type: string;
  stages: string[];
  difficulty: string;
  taskCount: number;
}

const TEMPLATES: Record<string, ProjectTemplate> = {
  apartment: { name: "Apartment Renovation", type: "residential", stages: ["Demolition", "Rough-in", "Finishing", "Final inspection"], difficulty: "medium", taskCount: 12 },
  office: { name: "Office Build-out", type: "commercial", stages: ["Space Planning", "MEP Rough-in", "Partitions & Finishes", "Furniture & IT", "Punch list"], difficulty: "high", taskCount: 18 },
  landscape: { name: "Landscape Work", type: "residential", stages: ["Site Preparation", "Drainage & Grading", "Paving", "Planting & Finishing"], difficulty: "medium", taskCount: 9 },
  bathroom: { name: "Bathroom Renovation", type: "residential", stages: ["Demolition", "Waterproofing & Plumbing", "Tiling & Fixtures"], difficulty: "medium", taskCount: 9 },
  house: { name: "House Construction", type: "residential", stages: ["Foundation", "Framing", "Roofing", "MEP Rough-in", "Interior Finishing", "Landscaping"], difficulty: "high", taskCount: 24 },
};

function pickTemplate(input: string): ProjectTemplate {
  const lower = input.toLowerCase();
  if (/office|commercial|workspace/.test(lower)) return TEMPLATES.office;
  if (/landscape|garden|yard|paving/.test(lower)) return TEMPLATES.landscape;
  if (/bath/.test(lower)) return TEMPLATES.bathroom;
  if (/house|home build|construction/.test(lower)) return TEMPLATES.house;
  return TEMPLATES.apartment;
}

export function generateProjectProposal(input: string): AIProposal {
  const template = pickTemplate(input);

  const changes: ProposalChange[] = [
    { entity_type: "project", action: "create", label: template.name, after: template.type },
    ...template.stages.map((s) => ({
      entity_type: "stage" as const,
      action: "create" as const,
      label: s,
    })),
    { entity_type: "meta", action: "create", label: `Difficulty: ${template.difficulty}`, after: `~${template.taskCount} tasks` },
  ];

  return {
    id: `proposal-${Date.now()}`,
    project_id: "__new__",
    type: "create_project",
    summary: `Create "${template.name}" with ${template.stages.length} stages`,
    changes,
    status: "pending",
  };
}

const TEXT_RESPONSES = [
  "I can help with tasks, estimates, procurement, and documents. Try asking me to add tasks or update the estimate!",
  "That's an interesting question. For now I can generate proposals for tasks, estimates, materials, and documents. What would you like?",
  "I'm your construction AI assistant. I can create tasks, adjust budgets, add procurement items, or draft documents. What do you need?",
];

export function getTextResponse(): string {
  return TEXT_RESPONSES[Math.floor(Math.random() * TEXT_RESPONSES.length)];
}

export { PROPOSAL_TYPE_TO_CONTRACT_ACTION, type ProposalActionMapping };
