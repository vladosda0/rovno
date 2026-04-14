import type { AIContextPack } from "@/lib/ai-project-context";
import type {
  AssistantGroundingStatus,
  LiveTextAssistantResult,
  LiveTextAssistantSource,
  PresentationalWorkProposal,
} from "@/lib/ai-assistant-contract";
import type { AIAccess } from "@/types/entities";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export type InferenceMode = "consult" | "proposal";

export interface InvokeLiveTextAssistantInput {
  projectId: string;
  contextPack: AIContextPack;
  userMessage: string;
  /** `"supabase"` triggers the hosted Edge Function; anything else uses the local mock. */
  workspaceKind: string;
  /** Effective AI access for the current user on this project. */
  aiAccess: AIAccess;
}

// ---------------------------------------------------------------------------
// Hosted path detection
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shouldUseHostedInference(workspaceKind: string, projectId: string): boolean {
  return workspaceKind === "supabase" && UUID_RE.test(projectId);
}

// ---------------------------------------------------------------------------
// Mode picker
// ---------------------------------------------------------------------------

const PROPOSAL_INTENT_RE = /\b(estimate|scope|work|proposal|quote|budget)\b/i;

export function pickInferenceMode(userMessage: string, aiAccess: AIAccess): InferenceMode {
  if (aiAccess !== "project_pool") return "consult";
  if (PROPOSAL_INTENT_RE.test(userMessage)) return "proposal";
  return "consult";
}

// ---------------------------------------------------------------------------
// Wire types (match hosted ai-inference Edge Function JSON)
// ---------------------------------------------------------------------------

interface AIInferenceRequestBody {
  projectId: string;
  mode: InferenceMode;
  message: string;
  contextPack: {
    projectContext: Record<string, unknown>;
    documentExcerpts: unknown[];
  };
}

type BackendGroundingStatus =
  | "client_attributed"
  | "partial_client_attributed"
  | "none"
  | "server_verified";

interface BackendGroundingSource {
  kind?: string;
  label?: string;
}

interface BackendWorkProposalStep {
  label?: string;
  note?: string;
}

interface BackendWorkProposal {
  title?: string;
  summary?: string;
  steps?: BackendWorkProposalStep[];
}

interface AIInferenceResponseBody {
  explanation?: string;
  groundingStatus?: BackendGroundingStatus;
  groundingNote?: string;
  groundingSources?: BackendGroundingSource[];
  workProposal?: BackendWorkProposal | null;
}

// ---------------------------------------------------------------------------
// Response mappers (exported for tests)
// ---------------------------------------------------------------------------

const GROUNDING_MAP: Record<BackendGroundingStatus, AssistantGroundingStatus> = {
  client_attributed: "project_context_grounded",
  partial_client_attributed: "partial",
  none: "ungrounded",
  server_verified: "project_context_grounded",
};

export function mapGroundingStatus(raw: string | undefined): AssistantGroundingStatus {
  if (raw && raw in GROUNDING_MAP) return GROUNDING_MAP[raw as BackendGroundingStatus];
  return "ungrounded";
}

export function mapGroundingSources(raw: BackendGroundingSource[] | undefined): LiveTextAssistantSource[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((s) => ({
    kind: (s.kind === "project_summary" || s.kind === "recent_activity") ? s.kind : "other",
    label: typeof s.label === "string" ? s.label : "Source",
  }));
}

export function mapWorkProposal(raw: BackendWorkProposal | null | undefined): PresentationalWorkProposal | undefined {
  if (!raw || !raw.title) return undefined;
  return {
    proposalTitle: raw.title,
    proposalSummary: raw.summary ?? "",
    suggestedWorkItems: (raw.steps ?? []).map((step) => ({
      label: step.label ?? "",
      note: step.note,
    })),
  };
}

export function mapInferenceResponse(body: AIInferenceResponseBody): LiveTextAssistantResult {
  return {
    explanation: typeof body.explanation === "string" ? body.explanation : "The assistant returned an empty response.",
    grounding: mapGroundingStatus(body.groundingStatus),
    groundingNote: typeof body.groundingNote === "string" ? body.groundingNote : undefined,
    sources: mapGroundingSources(body.groundingSources),
    workProposal: mapWorkProposal(body.workProposal),
  };
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

export function buildInferenceRequestBody(
  projectId: string,
  mode: InferenceMode,
  userMessage: string,
  contextPack: AIContextPack,
): AIInferenceRequestBody {
  const { _meta: _, ...safeContext } = contextPack;
  return {
    projectId,
    mode,
    message: userMessage,
    contextPack: {
      projectContext: safeContext as unknown as Record<string, unknown>,
      documentExcerpts: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Edge invoke errors (mirror workspace-source invite flow)
// ---------------------------------------------------------------------------

function parseEdgeFunctionErrorBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.error === "string") return record.error;
  if (record.error && typeof record.error === "object" && record.error !== null && "message" in record.error) {
    const m = (record.error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return null;
}

/** User-visible copy for known provider / schema failures logged server-side. */
export function sanitizeAiInferenceUserMessage(raw: string): string {
  const t = raw.trim();
  const fallback = "The assistant could not complete this request. Please try again.";
  if (!t) return fallback;
  const lower = t.toLowerCase();
  if (
    lower.includes("invalid json")
    || lower.includes("provider returned")
    || lower.includes("invalid provider")
    || lower.includes("failed to parse")
  ) {
    return "The AI service had trouble formatting its reply. Please try again in a moment.";
  }
  if (t.length > 400) return fallback;
  return t;
}

async function resolveAiInferenceInvokeFailureMessage(error: unknown, data: unknown): Promise<string> {
  const fromData = parseEdgeFunctionErrorBody(data);
  if (fromData) return sanitizeAiInferenceUserMessage(fromData);

  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (typeof Response !== "undefined" && ctx instanceof Response) {
      const status = ctx.status;
      const raw = await ctx.clone().text().catch(() => "");
      const trimmed = raw.trim();
      if (trimmed) {
        try {
          const j = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof j.error === "string") return sanitizeAiInferenceUserMessage(j.error);
          if (j.error && typeof j.error === "object" && j.error !== null && "message" in j.error) {
            const m = (j.error as { message?: unknown }).message;
            if (typeof m === "string") return sanitizeAiInferenceUserMessage(m);
          }
          if (typeof j.message === "string") return sanitizeAiInferenceUserMessage(j.message);
        } catch {
          /* not JSON */
        }
        const clipped = trimmed.length <= 400 ? trimmed : `${trimmed.slice(0, 400)}…`;
        return sanitizeAiInferenceUserMessage(clipped);
      }
      const statusText = ctx.statusText?.trim();
      return statusText ? `Request failed (${status} ${statusText}). Please try again.` : `Request failed (HTTP ${status}). Please try again.`;
    }
  }

  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return sanitizeAiInferenceUserMessage(m);
  }

  return sanitizeAiInferenceUserMessage("");
}

/** Safe message to show in the assistant bubble when `invokeLiveTextAssistant` throws. */
export function userVisibleLiveTextAssistantError(err: unknown): string {
  const fallback = "The assistant could not complete this request. Please try again.";
  if (!(err instanceof Error)) return fallback;
  const m = err.message.trim();
  if (!m) return fallback;
  if (m.length > 420) return fallback;
  if (/\bat\s+[\w.$/]+\s*\([^)]*:\d+:\d+\)/.test(m)) return fallback;
  return m;
}

// ---------------------------------------------------------------------------
// Hosted invoke
// ---------------------------------------------------------------------------

async function invokeHosted(
  projectId: string,
  mode: InferenceMode,
  userMessage: string,
  contextPack: AIContextPack,
): Promise<LiveTextAssistantResult> {
  const { supabase } = await import("@/integrations/supabase/client");
  const body = buildInferenceRequestBody(projectId, mode, userMessage, contextPack);

  const { data, error } = await supabase.functions.invoke("ai-inference", { body });

  const bodyError = parseEdgeFunctionErrorBody(data);
  if (bodyError) {
    throw new Error(sanitizeAiInferenceUserMessage(bodyError));
  }

  if (error) {
    const msg = await resolveAiInferenceInvokeFailureMessage(error, data);
    throw new Error(msg);
  }

  const responseBody = data as AIInferenceResponseBody | null;
  if (!responseBody || typeof responseBody !== "object") {
    throw new Error(sanitizeAiInferenceUserMessage("AI assistant returned an unexpected response."));
  }

  return mapInferenceResponse(responseBody);
}

// ---------------------------------------------------------------------------
// Mock fallback (preserved from Wave 1)
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

function buildMockSources(pack: AIContextPack): LiveTextAssistantSource[] {
  const sources: LiveTextAssistantSource[] = [];
  const title = pack.project.title.trim();
  if (title) {
    sources.push({
      kind: "project_summary",
      label: `Project: ${title} (${pack.project.type || "—"}) · progress ${pack.project.progress}`,
    });
  }
  if (pack.recentEvents.length > 0) {
    sources.push({
      kind: "recent_activity",
      label: `Recent activity: ${pack.recentEvents.length} recent event type(s) (no payload text sent to the assistant).`,
    });
  }
  return sources;
}

function pickMockGrounding(pack: AIContextPack): {
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
} {
  if (!pack.project.title.trim()) {
    return {
      grounding: "ungrounded",
      groundingNote: "Project title is missing in the assembled context, so the answer is not tied to a specific project record.",
    };
  }
  if (pack._meta.hiddenDomains.length > 0) {
    return {
      grounding: "partial",
      groundingNote: `Some project areas are hidden for your role (${pack._meta.hiddenDomains.join(", ")}). This answer uses only the visible context pack.`,
    };
  }
  return { grounding: "project_context_grounded" };
}

function maybeMockWorkProposal(userMessage: string, pack: AIContextPack): PresentationalWorkProposal | undefined {
  if (!PROPOSAL_INTENT_RE.test(userMessage)) return undefined;
  return {
    proposalTitle: `Draft scope for ${pack.project.title || "this project"}`,
    proposalSummary:
      "Illustrative work items for discussion only — not applied to the estimate. Review and enter manually on the estimate tab.",
    suggestedWorkItems: [
      { label: "Site verification & existing conditions", note: "Confirm assumptions before pricing." },
      { label: "Rough-in / first-fix", note: "Align with current stage plan if applicable." },
      { label: "Finish & handover", note: "Adjust to match your contract scope." },
    ],
  };
}

async function invokeMock(input: InvokeLiveTextAssistantInput): Promise<LiveTextAssistantResult> {
  await delay(320);
  const { contextPack, userMessage } = input;
  const { grounding, groundingNote } = pickMockGrounding(contextPack);
  const sources = buildMockSources(contextPack);
  const preview = userMessage.trim().slice(0, 200);
  const explanation = [
    `Here is a concise take on "${preview}${userMessage.length > 200 ? "…" : ""}" for **${contextPack.project.title || "this project"}**.`,
    "",
    grounding === "project_context_grounded"
      ? "This mock response is aligned with the visible project context pack (roles, hidden domains, and summaries you are allowed to see)."
      : grounding === "partial"
        ? "This mock response is based only on partial context because some domains are hidden for your role."
        : "This mock response is not reliably tied to project sources (missing or insufficient context).",
    "",
    "_Wave 1 uses a frontend mock — replace `invokeLiveTextAssistant` with a real endpoint when ready._",
  ].join("\n");
  return {
    explanation,
    grounding,
    groundingNote,
    sources: sources.length > 0 ? sources : undefined,
    workProposal: maybeMockWorkProposal(userMessage, contextPack),
  };
}

// ---------------------------------------------------------------------------
// Public API — single entry point used by AISidebar
// ---------------------------------------------------------------------------

export async function invokeLiveTextAssistant(
  input: InvokeLiveTextAssistantInput,
): Promise<LiveTextAssistantResult> {
  if (shouldUseHostedInference(input.workspaceKind, input.projectId)) {
    const mode = pickInferenceMode(input.userMessage, input.aiAccess);
    return invokeHosted(input.projectId, mode, input.userMessage, input.contextPack);
  }
  return invokeMock(input);
}
