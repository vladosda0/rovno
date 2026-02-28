import type { AIMessage } from "@/types/ai";
import type { Event } from "@/types/entities";

export type DemoScenarioId = "live" | "A" | "B" | "C" | "D" | "E" | "F";

export interface ProposalExecutionLink {
  summary?: string;
  proposalId?: string;
  childEventIds: string[];
}

export interface SidebarDemoScenarioData {
  events: Event[];
  messages: AIMessage[];
  proposalLinks: Record<string, ProposalExecutionLink>;
  expandedGroupEventIds?: string[];
}

interface BuildScenarioInput {
  projectId: string;
  userId: string;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function makeEvent(
  id: string,
  projectId: string,
  actorId: string,
  type: Event["type"],
  objectType: string,
  objectId: string,
  timestamp: string,
  payload: Record<string, unknown>,
): Event {
  return {
    id,
    project_id: projectId,
    actor_id: actorId,
    type,
    object_type: objectType,
    object_id: objectId,
    timestamp,
    payload,
  };
}

function scenarioA(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = Date.now();
  const { projectId, userId } = input;
  const events: Event[] = [
    makeEvent("scA-1", projectId, userId, "task_created", "task", "task-a1", toIso(base - 7 * 60 * 60 * 1000), { title: "Remove old flooring" }),
    makeEvent("scA-2", projectId, "ai", "task_created", "task", "task-a2", toIso(base - 6.8 * 60 * 60 * 1000), { title: "Install junction boxes", source: "ai" }),
    makeEvent("scA-3", projectId, "ai", "task_created", "task", "task-a3", toIso(base - 6.6 * 60 * 60 * 1000), { title: "Run conduit", source: "ai" }),
    makeEvent("scA-4", projectId, "ai", "document_created", "document", "doc-a4", toIso(base - 6.4 * 60 * 60 * 1000), { title: "Subcontractor Agreement", source: "ai" }),
    makeEvent("scA-5", projectId, userId, "photo_uploaded", "media", "media-a5", toIso(base - 6.1 * 60 * 60 * 1000), { caption: "Wiring progress" }),
    makeEvent("scA-6", projectId, "ai", "estimate_created", "estimate_version", "ev-a6", toIso(base - 5.8 * 60 * 60 * 1000), { version: 3, source: "ai" }),
    makeEvent("scA-7", projectId, userId, "comment_added", "task", "task-a2", toIso(base - 5.4 * 60 * 60 * 1000), { text: "Need final inspection before close-out." }),
  ];
  return { events, messages: [], proposalLinks: {} };
}

function scenarioB(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = Date.now();
  const { projectId, userId } = input;
  const proposalEventId = "scB-proposal";
  const taskEventId = "scB-task";
  const docEventId = "scB-doc";
  const events: Event[] = [
    makeEvent("scB-1", projectId, userId, "member_added", "member", "user-2", toIso(base - 9 * 60 * 60 * 1000), { name: "Dmitry Sokolov" }),
    makeEvent(taskEventId, projectId, "ai", "task_created", "task", "task-b1", toIso(base - 4.2 * 60 * 60 * 1000), { title: "Install conduit", source: "ai" }),
    makeEvent(docEventId, projectId, "ai", "document_created", "document", "doc-b1", toIso(base - 4.15 * 60 * 60 * 1000), { title: "Electrical Scope Addendum", source: "ai" }),
    makeEvent(
      proposalEventId,
      projectId,
      "ai",
      "proposal_confirmed",
      "proposal",
      "proposal-b1",
      toIso(base - 4.1 * 60 * 60 * 1000),
      { summary: "Add conduit task and draft addendum", source: "ai" },
    ),
  ];
  return {
    events,
    messages: [],
    proposalLinks: {
      [proposalEventId]: {
        summary: "Add conduit task and draft addendum",
        proposalId: "proposal-b1",
        childEventIds: [taskEventId, docEventId],
      },
    },
  };
}

function scenarioC(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = scenarioB(input);
  return {
    ...base,
    expandedGroupEventIds: ["scB-proposal"],
  };
}

function scenarioD(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = Date.now();
  const { projectId, userId } = input;
  const events: Event[] = [
    makeEvent("scD-1", projectId, userId, "task_created", "task", "task-d1", toIso(base - 5.5 * 60 * 60 * 1000), { title: "Create floor plan" }),
    makeEvent(
      "scD-2",
      projectId,
      "ai",
      "proposal_cancelled",
      "proposal",
      "proposal-d1",
      toIso(base - 5 * 60 * 60 * 1000),
      { summary: "Order premium fixtures package", status: "cancelled", source: "ai" },
    ),
  ];
  return { events, messages: [], proposalLinks: {} };
}

function scenarioE(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = Date.now();
  const { projectId, userId } = input;
  const events: Event[] = [
    makeEvent("scE-1", projectId, userId, "task_created", "task", "task-e1", toIso(base - 7 * 60 * 60 * 1000), { title: "Verify insulation details" }),
  ];
  const messages: AIMessage[] = [
    {
      id: "scE-msg-1",
      role: "user",
      mode: "learn",
      content: "Why did you prioritize insulation before flooring?",
      timestamp: toIso(base - 4.5 * 60 * 60 * 1000),
    },
    {
      id: "scE-msg-2",
      role: "assistant",
      content: "Insulation must pass before finish layers. It avoids rework and keeps the inspection sequence clean.",
      timestamp: toIso(base - 4.45 * 60 * 60 * 1000),
    },
  ];
  return { events, messages, proposalLinks: {} };
}

function scenarioF(input: BuildScenarioInput): SidebarDemoScenarioData {
  const base = Date.now();
  const { projectId, userId } = input;
  const proposalEventId = "scF-proposal";
  const taskEventId = "scF-task";
  const estimateEventId = "scF-estimate";
  const events: Event[] = [
    makeEvent("scF-1", projectId, userId, "task_completed", "task", "task-f0", toIso(base - 22 * 60 * 60 * 1000), { title: "Demolition complete" }),
    makeEvent("scF-2", projectId, "user-2", "photo_uploaded", "media", "media-f1", toIso(base - 20 * 60 * 60 * 1000), { caption: "Wall framing progress" }),
    makeEvent(taskEventId, projectId, "ai", "task_created", "task", "task-f2", toIso(base - 3.6 * 60 * 60 * 1000), { title: "Install inspection access panel", source: "ai" }),
    makeEvent(estimateEventId, projectId, "ai", "estimate_created", "estimate_version", "ev-f2", toIso(base - 3.5 * 60 * 60 * 1000), { version: 4, source: "ai" }),
    makeEvent(
      proposalEventId,
      projectId,
      "ai",
      "proposal_confirmed",
      "proposal",
      "proposal-f1",
      toIso(base - 3.45 * 60 * 60 * 1000),
      { summary: "Add access panel task and update estimate", source: "ai" },
    ),
    makeEvent("scF-3", projectId, userId, "comment_added", "task", "task-f2", toIso(base - 2.4 * 60 * 60 * 1000), { text: "Please keep this on tomorrow’s checklist." }),
  ];
  return {
    events,
    messages: [],
    proposalLinks: {
      [proposalEventId]: {
        summary: "Add access panel task and update estimate",
        proposalId: "proposal-f1",
        childEventIds: [taskEventId, estimateEventId],
      },
    },
  };
}

export function getSidebarDemoScenarioData(
  scenario: DemoScenarioId,
  input: BuildScenarioInput,
): SidebarDemoScenarioData | null {
  switch (scenario) {
    case "A":
      return scenarioA(input);
    case "B":
      return scenarioB(input);
    case "C":
      return scenarioC(input);
    case "D":
      return scenarioD(input);
    case "E":
      return scenarioE(input);
    case "F":
      return scenarioF(input);
    default:
      return null;
  }
}
