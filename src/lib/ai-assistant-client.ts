import type { AIContextPack } from "@/lib/ai-project-context";
import type {
  AssistantGroundingStatus,
  InferenceGroundingKind,
  LiveTextAssistantResult,
  LiveTextAssistantSource,
  LiveTextFollowUpPrompt,
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
  /** Optional UUID — Layer B session continuity for hosted `ai-inference`. */
  chatId?: string;
}

// ---------------------------------------------------------------------------
// Hosted path detection
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function shouldUseHostedInference(workspaceKind: string, projectId: string): boolean {
  return workspaceKind === "supabase" && UUID_RE.test(projectId);
}

/** Explicit opt-out for hosted inference (Supabase + UUID) via `VITE_AI_LIVE_TEXT_ASSISTANT`. */
export function isLiveTextHostedKillSwitchEnabled(): boolean {
  const v = import.meta.env.VITE_AI_LIVE_TEXT_ASSISTANT;
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "") return false;
  return s === "0" || s === "false" || s === "no" || s === "off";
}

/** Hosted edge path for project AI (default-on for Supabase + UUID; kill switch above). */
export function shouldUseHostedLiveTextAssistantPath(workspaceKind: string, projectId: string): boolean {
  return shouldUseHostedInference(workspaceKind, projectId) && !isLiveTextHostedKillSwitchEnabled();
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
  chatId?: string;
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
  /** Hosted `ai-inference` / Gigachat schema uses title + description per step. */
  title?: string;
  description?: string;
}

interface BackendWorkProposal {
  title?: string;
  summary?: string;
  steps?: BackendWorkProposalStep[];
}

interface AIInferenceResponseBody {
  responseVersion?: string;
  answerText?: string;
  groundingKind?: string;
  groundingDetails?: {
    serverSnapshotUsed?: boolean;
    domainsRetrieved?: unknown;
    evidenceTruncated?: boolean;
  };
  followUps?: unknown;
  freshnessHint?: unknown;
  optionalWorkProposalPreview?: BackendWorkProposal | null;
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

function formatGroundingSourceFallbackLabel(kind: string | undefined): string {
  if (!kind || typeof kind !== "string") return "Source";
  const map: Record<string, string> = {
    client_project_context: "Project context",
    client_document_metadata: "Document metadata",
    server_verified_estimate: "Estimate details",
    server_verified_procurement: "Procurement records",
    server_verified_tasks: "Task details",
    server_verified_hr: "HR details",
    server_verified_participants: "Project participants",
    server_verified_activity: "Recent project activity",
    server_verified_documents_metadata: "Documents — titles/metadata only (not full text)",
    server_verified_media_metadata: "Media — filenames/metadata only (not file contents)",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}

function softenProgrammaticCopy(value: string): string {
  return value
    .replace(/\bserver[- ]verified\b/gi, "checked")
    .replace(/\s*\(server\)/gi, "")
    .replace(/\bserver\b/gi, "project system")
    .replace(/\bfrontend\b/gi, "app")
    .replace(/\bbackend\b/gi, "system")
    .replace(/\bEvidence domains\b/gi, "Project areas")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function mapGroundingSources(raw: BackendGroundingSource[] | undefined): LiveTextAssistantSource[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map((s) => {
    const kind = (s.kind === "project_summary" || s.kind === "recent_activity") ? s.kind : "other";
    const hasLabel = typeof s.label === "string" && s.label.trim();
    const label = hasLabel
      ? s.label!.trim()
      : (s.kind === "project_summary" || s.kind === "recent_activity")
        ? "Source"
        : formatGroundingSourceFallbackLabel(s.kind);
    return { kind, label: softenProgrammaticCopy(label) };
  });
}

function mapWorkProposalStep(step: BackendWorkProposalStep): { label: string; note?: string } {
  const label = typeof step.label === "string" && step.label.trim()
    ? step.label
    : (typeof step.title === "string" ? step.title : "");
  const note = typeof step.note === "string"
    ? step.note
    : (typeof step.description === "string" ? step.description : undefined);
  return { label, note };
}

export function mapWorkProposal(raw: BackendWorkProposal | null | undefined): PresentationalWorkProposal | undefined {
  if (!raw || !raw.title) return undefined;
  return {
    proposalTitle: raw.title,
    proposalSummary: raw.summary ?? "",
    suggestedWorkItems: (raw.steps ?? []).map((step) => mapWorkProposalStep(step)),
  };
}

const INFERENCE_GROUNDING_KINDS: ReadonlySet<string> = new Set<InferenceGroundingKind>([
  "grounded_on_project_sources",
  "partially_grounded",
  "not_grounded_on_project_sources_but_general_guidance_available",
]);

export function mapGroundingKind(raw: string | undefined): AssistantGroundingStatus | undefined {
  if (!raw || !INFERENCE_GROUNDING_KINDS.has(raw)) return undefined;
  switch (raw as InferenceGroundingKind) {
    case "grounded_on_project_sources":
      return "project_context_grounded";
    case "partially_grounded":
      return "partial";
    case "not_grounded_on_project_sources_but_general_guidance_available":
      return "ungrounded";
    default:
      return undefined;
  }
}

function parseFollowUps(raw: unknown): LiveTextFollowUpPrompt[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: LiveTextFollowUpPrompt[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.prompt !== "string" || !rec.prompt.trim()) continue;
    const intent = typeof rec.intent === "string" && rec.intent.trim() ? rec.intent : undefined;
    out.push({ prompt: rec.prompt.trim(), intent });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeFreshnessHint(value: unknown): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return null;
}

function parseGroundingDetails(raw: AIInferenceResponseBody["groundingDetails"]):
  LiveTextAssistantResult["groundingDetails"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const domainsRaw = raw.domainsRetrieved;
  const domainsRetrieved = Array.isArray(domainsRaw)
    ? domainsRaw.filter((d): d is string => typeof d === "string" && d.length > 0)
    : [];
  return {
    serverSnapshotUsed: typeof raw.serverSnapshotUsed === "boolean" ? raw.serverSnapshotUsed : false,
    domainsRetrieved,
    evidenceTruncated: typeof raw.evidenceTruncated === "boolean" ? raw.evidenceTruncated : false,
  };
}

function pickAnswerText(body: AIInferenceResponseBody): string {
  if (typeof body.answerText === "string" && body.answerText.trim()) return body.answerText;
  if (typeof body.explanation === "string" && body.explanation.trim()) return body.explanation;
  return "The assistant could not prepare a reply.";
}

export function mapInferenceResponse(body: AIInferenceResponseBody): LiveTextAssistantResult {
  const fromKind = mapGroundingKind(body.groundingKind);
  const grounding = fromKind ?? mapGroundingStatus(body.groundingStatus);
  const proposal = mapWorkProposal(body.optionalWorkProposalPreview ?? body.workProposal ?? undefined);
  const freshnessHint = normalizeFreshnessHint(body.freshnessHint);

  const groundingKind = body.groundingKind && INFERENCE_GROUNDING_KINDS.has(body.groundingKind)
    ? (body.groundingKind as InferenceGroundingKind)
    : undefined;

  return {
    explanation: pickAnswerText(body),
    grounding,
    groundingNote: typeof body.groundingNote === "string" ? softenProgrammaticCopy(body.groundingNote) : undefined,
    sources: mapGroundingSources(body.groundingSources),
    workProposal: proposal,
    responseVersion: typeof body.responseVersion === "string" ? body.responseVersion : undefined,
    groundingKind,
    groundingDetails: parseGroundingDetails(body.groundingDetails),
    followUps: parseFollowUps(body.followUps),
    freshnessHint: freshnessHint === undefined ? undefined : freshnessHint,
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
  chatId?: string,
): AIInferenceRequestBody {
  const { _meta: _, ...safeContext } = contextPack;
  const body: AIInferenceRequestBody = {
    projectId,
    mode,
    message: userMessage,
    contextPack: {
      projectContext: safeContext as unknown as Record<string, unknown>,
      documentExcerpts: [],
    },
  };
  if (chatId && UUID_RE.test(chatId)) {
    body.chatId = chatId;
  }
  return body;
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
    return "The assistant had trouble preparing a reliable reply. Please try again in a moment.";
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
  chatId?: string,
): Promise<LiveTextAssistantResult> {
  const { supabase } = await import("@/integrations/supabase/client");
  const body = buildInferenceRequestBody(projectId, mode, userMessage, contextPack, chatId);

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
    throw new Error(sanitizeAiInferenceUserMessage("The assistant could not prepare a reliable reply."));
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
  if (shouldUseHostedLiveTextAssistantPath(input.workspaceKind, input.projectId)) {
    const mode = pickInferenceMode(input.userMessage, input.aiAccess);
    return invokeHosted(
      input.projectId,
      mode,
      input.userMessage,
      input.contextPack,
      input.chatId,
    );
  }
  return invokeMock(input);
}
