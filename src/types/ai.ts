export type AIMessageRole = "user" | "assistant";
export type AIProposalType = "add_task" | "update_estimate" | "add_procurement" | "generate_document" | "create_project";
export type AIProposalStatus = "pending" | "confirmed" | "cancelled";
export type ProposalChangeAction = "create" | "update" | "delete";

export interface ProposalChange {
  entity_type: string;
  action: ProposalChangeAction;
  label: string;
  before?: string;
  after?: string;
}

export interface AIProposal {
  id: string;
  project_id: string;
  type: AIProposalType;
  summary: string;
  changes: ProposalChange[];
  status: AIProposalStatus;
}

import type {
  AssistantGroundingStatus,
  InferenceGroundingKind,
  LiveTextAssistantSource,
  LiveTextFollowUpPrompt,
  PresentationalWorkProposal,
} from "@/lib/ai-assistant-contract";

/** Structured payload for Wave 1 live text turns (not committable; no `AIProposal` queue). */
export interface AIMessageLiveTextAssistantV1 {
  version: 1;
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
  sources?: LiveTextAssistantSource[];
  workProposal?: PresentationalWorkProposal;
  /** Wave 8 — mirrors `LiveTextAssistantResult` for persisted thread rendering. */
  responseVersion?: string;
  groundingKind?: InferenceGroundingKind;
  groundingDetails?: {
    serverSnapshotUsed: boolean;
    domainsRetrieved: string[];
    evidenceTruncated: boolean;
  };
  followUps?: LiveTextFollowUpPrompt[];
  freshnessHint?: Record<string, unknown> | null;
}

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: string;
  mode?: "default" | "learn";
  proposal?: AIProposal;
  liveTextAssistantV1?: AIMessageLiveTextAssistantV1;
  /** Project id the live text turn used (handoff to `/project/:id/estimate`). */
  liveTextProjectId?: string;
}
