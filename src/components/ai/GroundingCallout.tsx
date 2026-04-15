import type {
  AssistantGroundingStatus,
  InferenceGroundingKind,
  LiveTextAssistantSource,
} from "@/lib/ai-assistant-contract";
import { Info, AlertTriangle, ShieldCheck } from "lucide-react";

const GROUNDING_COPY: Record<
  AssistantGroundingStatus,
  { title: string; className: string; Icon: typeof Info }
> = {
  project_context_grounded: {
    title: "Grounded on visible project context",
    className: "border-success/30 bg-success/5 text-foreground",
    Icon: ShieldCheck,
  },
  partial: {
    title: "Partially grounded",
    className: "border-warning/40 bg-warning/10 text-foreground",
    Icon: AlertTriangle,
  },
  ungrounded: {
    title: "Not grounded on project sources",
    className: "border-muted-foreground/30 bg-muted/30 text-foreground",
    Icon: Info,
  },
};

/** Human-readable line for `groundingDetails.domainsRetrieved` entries (honest metadata wording). */
export function domainRetrievedToLabel(domain: string): string {
  const d = domain.trim();
  const map: Record<string, string> = {
    estimate: "Estimate",
    procurement: "Procurement",
    tasks: "Tasks",
    hr: "HR",
    participants: "Participants",
    activity: "Activity",
    documents_metadata: "Documents (metadata only — not full document text)",
    media_metadata: "Media (metadata only — not file contents)",
  };
  return map[d] ?? d.replace(/_/g, " ");
}

/** Only show freshness fields explicitly intended for UI (avoid arbitrary server string blobs). */
const FRESHNESS_HINT_KEYS = new Set(["message", "summary", "hint", "note", "context"]);

function formatFreshnessHintLine(hint: Record<string, unknown> | null | undefined): string | null {
  if (!hint || typeof hint !== "object") return null;
  const parts = Object.entries(hint)
    .filter(([k, v]) => FRESHNESS_HINT_KEYS.has(k) && typeof v === "string" && (v as string).trim())
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v).trim()}`);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

export function GroundingCallout(props: {
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
  sources?: LiveTextAssistantSource[];
  /** When present with `ungrounded`, clarifies general-guidance mode vs missing answer. */
  inferenceGroundingKind?: InferenceGroundingKind;
  groundingDetails?: {
    serverSnapshotUsed: boolean;
    domainsRetrieved: string[];
    evidenceTruncated: boolean;
  };
  freshnessHint?: Record<string, unknown> | null;
}) {
  const {
    grounding,
    groundingNote,
    sources,
    inferenceGroundingKind,
    groundingDetails,
    freshnessHint,
  } = props;

  const cfg = GROUNDING_COPY[grounding];
  let title = cfg.title;
  if (
    grounding === "ungrounded"
    && inferenceGroundingKind === "not_grounded_on_project_sources_but_general_guidance_available"
  ) {
    title = "General guidance (limited project evidence)";
  }
  const Icon = cfg.Icon;

  const domains = groundingDetails?.domainsRetrieved?.filter(Boolean) ?? [];
  const freshnessLine = formatFreshnessHintLine(freshnessHint);

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 text-caption ${cfg.className}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-tight">{title}</p>
          {groundingDetails && groundingDetails.serverSnapshotUsed ? (
            <p className="text-muted-foreground leading-snug">
              Server project snapshot was used for orientation (not a full data export).
            </p>
          ) : null}
          {domains.length > 0 ? (
            <div className="text-muted-foreground leading-snug">
              <p className="font-medium text-foreground/90">Evidence domains (this turn)</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                {domains.map((dom) => (
                  <li key={dom} className="break-words">{domainRetrievedToLabel(dom)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {groundingDetails?.evidenceTruncated ? (
            <p className="text-muted-foreground leading-snug">
              Some retrieved evidence was truncated to stay within safe limits.
            </p>
          ) : null}
          {freshnessLine ? (
            <p className="text-muted-foreground leading-snug break-words">{freshnessLine}</p>
          ) : null}
          {groundingNote ? (
            <p className="text-muted-foreground leading-snug whitespace-pre-wrap break-words">{groundingNote}</p>
          ) : null}
          {sources && sources.length > 0 ? (
            <ul className="list-disc pl-3.5 space-y-0.5 text-muted-foreground leading-snug">
              {sources.map((s, i) => (
                <li key={`${s.kind}-${i}`} className="break-words">{s.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
