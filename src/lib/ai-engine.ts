import type { AIProposal, ProposalChange } from "@/types/ai";
import { getProject, getStages } from "@/data/store";

export function generateProposal(input: string, projectId: string): AIProposal | null {
  const lower = input.toLowerCase();
  const project = getProject(projectId);
  if (!project) return null;

  const stages = getStages(projectId);
  const currentStage = stages.find((s) => s.id === project.current_stage_id) ?? stages[0];
  const stageTitle = currentStage?.title ?? "Current stage";

  if (/task|add task|create task/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "task", action: "create", label: `Install junction boxes — ${stageTitle}`, after: "not_started" },
      { entity_type: "task", action: "create", label: `Run conduit for ${stageTitle}`, after: "not_started" },
      { entity_type: "task", action: "create", label: `Inspection sign-off — ${stageTitle}`, after: "not_started" },
    ];
    return {
      id: `proposal-${Date.now()}`,
      project_id: projectId,
      type: "add_task",
      summary: `Add 3 tasks for "${stageTitle}"`,
      changes,
      status: "pending",
    };
  }

  if (/estimate|cost|budget/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "estimate_item", action: "update", label: "Electrical rough-in", before: "48,000 ₽", after: "52,000 ₽" },
      { entity_type: "estimate_item", action: "create", label: "Additional outlet points ×6", after: "12,000 ₽" },
    ];
    return {
      id: `proposal-${Date.now()}`,
      project_id: projectId,
      type: "update_estimate",
      summary: "Update estimate — adjust electrical costs",
      changes,
      status: "pending",
    };
  }

  if (/procurement|buy|purchase|material/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "procurement_item", action: "create", label: "LED panel lights 60×60 ×12", after: "18,000 ₽" },
      { entity_type: "procurement_item", action: "create", label: "Cable tray 2m sections ×8", after: "6,400 ₽" },
    ];
    return {
      id: `proposal-${Date.now()}`,
      project_id: projectId,
      type: "add_procurement",
      summary: "Add 2 procurement items",
      changes,
      status: "pending",
    };
  }

  if (/document|contract|generate|report/i.test(lower)) {
    const changes: ProposalChange[] = [
      { entity_type: "document", action: "create", label: `Subcontractor Agreement — ${stageTitle}`, after: "Draft v1" },
    ];
    return {
      id: `proposal-${Date.now()}`,
      project_id: projectId,
      type: "generate_document",
      summary: "Generate subcontractor agreement draft",
      changes,
      status: "pending",
    };
  }

  return null;
}

const TEXT_RESPONSES = [
  "I can help with tasks, estimates, procurement, and documents. Try asking me to add tasks or update the estimate!",
  "That's an interesting question. For now I can generate proposals for tasks, estimates, materials, and documents. What would you like?",
  "I'm your construction AI assistant. I can create tasks, adjust budgets, add procurement items, or draft documents. What do you need?",
];

export function getTextResponse(): string {
  return TEXT_RESPONSES[Math.floor(Math.random() * TEXT_RESPONSES.length)];
}
