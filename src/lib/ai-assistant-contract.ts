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

/** Hosted ai-inference `groundingKind` (architecture contract). */
export type InferenceGroundingKind =
  | "grounded_on_project_sources"
  | "partially_grounded"
  | "not_grounded_on_project_sources_but_general_guidance_available";

export interface LiveTextFollowUpPrompt {
  prompt: string;
  intent?: string;
}

/** Result returned by `invokeLiveTextAssistant` (mock or hosted edge). */
export interface LiveTextAssistantResult {
  /** Resolved UI language for grounding chrome, mock copy, and client-side error sanitization. */
  assistantUiLanguage?: "ru" | "en";
  /** Primary answer text (mirrors backend `answerText`; `explanation` kept for UI copy). */
  explanation: string;
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
  sources?: LiveTextAssistantSource[];
  workProposal?: PresentationalWorkProposal;
  /** Wave 8 — backend response contract (optional when mock). */
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
