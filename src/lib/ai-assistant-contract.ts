/**
 * Presentational contract for the Wave 1 live text assistant response.
 * Not persisted; not committable; not estimate-v2 rows.
 */

export type AssistantGroundingStatus =
  | "project_context_grounded"
  | "partial"
  | "ungrounded";

export type LiveTextAssistantSourceKind = "project_summary" | "recent_activity" | "other";

export interface LiveTextAssistantSource {
  kind: LiveTextAssistantSourceKind;
  label: string;
}

export interface PresentationalWorkProposal {
  proposalTitle: string;
  proposalSummary: string;
  suggestedWorkItems: { label: string; note?: string }[];
}

/** Result returned by `invokeLiveTextAssistant` (mock or future HTTP/edge). */
export interface LiveTextAssistantResult {
  explanation: string;
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
  sources?: LiveTextAssistantSource[];
  workProposal?: PresentationalWorkProposal;
}
