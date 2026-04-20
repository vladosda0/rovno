import type {
  AssistantGroundingStatus,
  InferenceGroundingKind,
  LiveTextAssistantSource,
} from "@/lib/ai-assistant-contract";
import type { AiAssistantUiLanguage } from "@/lib/ai-assistant-client";
import { Info, AlertTriangle, ShieldCheck } from "lucide-react";

const GROUNDING_TITLE: Record<
  AssistantGroundingStatus,
  Record<AiAssistantUiLanguage, string>
> = {
  project_context_grounded: {
    en: "Using project context",
    ru: "Используется контекст проекта",
  },
  partial: {
    en: "Using limited project context",
    ru: "Используется ограниченный контекст проекта",
  },
  ungrounded: {
    en: "General guidance",
    ru: "Общие рекомендации",
  },
};

const GROUNDING_LIMITED_PROJECT: Record<AiAssistantUiLanguage, string> = {
  en: "General guidance with limited project context",
  ru: "Общие рекомендации с ограниченным контекстом проекта",
};

/** Human-readable line for `groundingDetails.domainsRetrieved` entries (honest metadata wording). */
export function domainRetrievedToLabel(
  domain: string,
  language: AiAssistantUiLanguage = "en",
): string {
  const d = domain.trim();
  if (language === "ru") {
    const map: Record<string, string> = {
      estimate: "Смета",
      procurement: "Закупки",
      tasks: "Задачи",
      hr: "Кадры",
      participants: "Участники",
      activity: "Активность",
      documents_metadata: "Документы (только метаданные — не полный текст)",
      media_metadata: "Медиа (только метаданные — не содержимое файлов)",
    };
    return map[d] ?? d.replace(/_/g, " ");
  }
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

function groundingCopyFor(
  grounding: AssistantGroundingStatus,
  inferenceGroundingKind: InferenceGroundingKind | undefined,
  language: AiAssistantUiLanguage,
): { title: string; className: string; Icon: typeof Info } {
  const baseClass: Record<AssistantGroundingStatus, string> = {
    project_context_grounded: "border-success/30 bg-success/5 text-foreground",
    partial: "border-warning/40 bg-warning/10 text-foreground",
    ungrounded: "border-muted-foreground/30 bg-muted/30 text-foreground",
  };
  const IconMap: Record<AssistantGroundingStatus, typeof Info> = {
    project_context_grounded: ShieldCheck,
    partial: AlertTriangle,
    ungrounded: Info,
  };
  let title = GROUNDING_TITLE[grounding][language];
  if (
    grounding === "ungrounded"
    && inferenceGroundingKind === "not_grounded_on_project_sources_but_general_guidance_available"
  ) {
    title = GROUNDING_LIMITED_PROJECT[language];
  }
  return {
    title,
    className: baseClass[grounding],
    Icon: IconMap[grounding],
  };
}

const CHROME: Record<
  AiAssistantUiLanguage,
  {
    snapshotNote: string;
    domainsHeading: string;
    truncatedNote: string;
  }
> = {
  en: {
    snapshotNote: "Project summary was used for orientation, not every project record.",
    domainsHeading: "Project areas used for this answer",
    truncatedNote: "Some project details were shortened to keep the answer reliable.",
  },
  ru: {
    snapshotNote: "Использовалась краткая сводка проекта для ориентира, не все записи.",
    domainsHeading: "Области проекта, использованные в ответе",
    truncatedNote: "Часть проектных деталей сокращена, чтобы ответ оставался надёжным.",
  },
};

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
  /** Profile / turn language for static chrome (defaults to English). */
  language?: AiAssistantUiLanguage;
}) {
  const {
    grounding,
    groundingNote,
    sources,
    inferenceGroundingKind,
    groundingDetails,
    freshnessHint,
    language = "en",
  } = props;

  const cfg = groundingCopyFor(grounding, inferenceGroundingKind, language);
  const { title, className: boxClass, Icon } = cfg;

  const domains = groundingDetails?.domainsRetrieved?.filter(Boolean) ?? [];
  const freshnessLine = formatFreshnessHintLine(freshnessHint);
  const copy = CHROME[language];

  return (
    <div className={`mt-2 rounded-lg border px-2.5 py-2 text-caption min-w-0 max-w-full ${boxClass}`}>
      <div className="flex items-start gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-tight">{title}</p>
          {groundingDetails && groundingDetails.serverSnapshotUsed ? (
            <p className="text-muted-foreground leading-snug">
              {copy.snapshotNote}
            </p>
          ) : null}
          {domains.length > 0 ? (
            <div className="text-muted-foreground leading-snug">
              <p className="font-medium text-foreground/90">{copy.domainsHeading}</p>
              <ul className="list-disc pl-3.5 space-y-0.5">
                {domains.map((dom) => (
                  <li key={dom} className="break-words">{domainRetrievedToLabel(dom, language)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {groundingDetails?.evidenceTruncated ? (
            <p className="text-muted-foreground leading-snug">
              {copy.truncatedNote}
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
