import type { AIContextPack } from "@/lib/ai-project-context";
import type {
  AssistantGroundingStatus,
  LiveTextAssistantResult,
  LiveTextAssistantSource,
  PresentationalWorkProposal,
} from "@/lib/ai-assistant-contract";

export interface InvokeLiveTextAssistantInput {
  projectId: string;
  contextPack: AIContextPack;
  userMessage: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildSources(pack: AIContextPack): LiveTextAssistantSource[] {
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

function pickGrounding(pack: AIContextPack): {
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

function maybeWorkProposal(userMessage: string, pack: AIContextPack): PresentationalWorkProposal | undefined {
  const q = userMessage.toLowerCase();
  const wants = /\b(estimate|scope|work|proposal|quote|budget)\b/i.test(q);
  if (!wants) return undefined;

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

/**
 * Wave 1: mock adapter. Swaps for `supabase.functions.invoke` (or similar) when backend exists.
 * Uses `contextPack` so the live path is honest about what would be sent upstream.
 */
export async function invokeLiveTextAssistant(
  input: InvokeLiveTextAssistantInput,
): Promise<LiveTextAssistantResult> {
  await delay(320);

  const { contextPack, userMessage } = input;
  const { grounding, groundingNote } = pickGrounding(contextPack);
  const sources = buildSources(contextPack);

  const preview = userMessage.trim().slice(0, 200);
  const explanation = [
    `Here is a concise take on “${preview}${userMessage.length > 200 ? "…" : ""}” for **${contextPack.project.title || "this project"}**.`,
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
    workProposal: maybeWorkProposal(userMessage, contextPack),
  };
}
