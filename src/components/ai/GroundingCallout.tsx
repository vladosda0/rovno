import type { AssistantGroundingStatus, LiveTextAssistantSource } from "@/lib/ai-assistant-contract";
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

export function GroundingCallout(props: {
  grounding: AssistantGroundingStatus;
  groundingNote?: string;
  sources?: LiveTextAssistantSource[];
}) {
  const { grounding, groundingNote, sources } = props;
  const cfg = GROUNDING_COPY[grounding];
  const Icon = cfg.Icon;

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 text-caption ${cfg.className}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-tight">{cfg.title}</p>
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
