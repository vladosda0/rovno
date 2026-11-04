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

/** One knowledge-base source under an answer (ai-inference `knowledgeBaseSources`, docs-library 5.2). */
export interface KbAnswerSource {
  docId: string;
  docSlug?: string;
  docLabel: string;
  clause?: string;
  anchor?: string;
  solutionSlug?: string;
  solutionTitle?: string;
  checking: boolean;
  pendingAmendments: number[];
  /** Approved amendments to the clause's document not in force yet (docs-library 7.4). */
  upcomingAmendments?: Array<{ no: number; effectiveFrom: string }>;
  /** Verbatim text of the clause or the card fact's quote, for the clause popover. */
  quote?: string;
}

/** Knowledge-base part of an answer: its sources, or «not in the base». */
export interface LiveTextKnowledgeBase {
  sources: KbAnswerSource[];
  missing: boolean;
}

/** Result returned by `invokeLiveTextAssistant` (mock or hosted edge). */
export interface LiveTextAssistantResult {
  /** Outside a project: the question was about a project, the client draws its own answer. */
  needsProject?: boolean;
  /** Which LLM backend served this turn when hosted (echo from `ai-inference`). */
  llmProvider?: "gigachat" | "qwen";
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
  /** Present only when the server searched the knowledge base for this turn. */
  knowledgeBase?: LiveTextKnowledgeBase;
}
