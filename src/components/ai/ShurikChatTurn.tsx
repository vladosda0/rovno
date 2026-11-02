import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookmarkPlus, Copy, Loader2, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { ShurikBubble, isFreshAssistantReply } from "@/components/ai/ShurikBubble";
import type { AiAnswerRating } from "@/lib/ai-answer-rating";
import { cn } from "@/lib/utils";
import type { AIMessage } from "@/types/ai";

// One look for a conversation with Shurik, in a project and outside one (docs-library 6.11,
// mockup frames 1a, 2, 7). Whatever differs between the two places comes in as children.

export function ShurikUserTurn({ content }: { content: string }) {
  return (
    <div className="flex min-w-0 max-w-full justify-end py-1.5">
      <div
        data-testid="shurik-user-turn"
        className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-[4px] bg-accent px-2.5 py-1.5 text-caption text-accent-foreground [overflow-wrap:anywhere]"
      >
        {content}
      </div>
    </div>
  );
}

interface ShurikAnswerActionsProps {
  rating?: AiAnswerRating;
  saved?: boolean;
  regenerating?: boolean;
  onCopy: () => void;
  onRate: (rating: AiAnswerRating) => void;
  onSave: () => void;
  onRegenerate: () => void;
}

const ACTION_CLASS = "inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors";
const ACTION_IDLE = "text-muted-foreground hover:text-foreground hover:bg-accent/10";

export function ShurikAnswerActions({
  rating,
  saved = false,
  regenerating = false,
  onCopy,
  onRate,
  onSave,
  onRegenerate,
}: ShurikAnswerActionsProps) {
  const { t } = useTranslation();
  return (
    <div className="mt-1.5 flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
      <button type="button" title={t("ai.sidebar.chat.actions.copy")} className={cn(ACTION_CLASS, ACTION_IDLE)} onClick={onCopy}>
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("ai.sidebar.chat.actions.rateGood")}
        aria-pressed={rating === "good"}
        className={cn(ACTION_CLASS, rating === "good" ? "text-accent bg-accent/15" : ACTION_IDLE)}
        onClick={() => onRate("good")}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("ai.sidebar.chat.actions.rateBad")}
        aria-pressed={rating === "bad"}
        className={cn(ACTION_CLASS, rating === "bad" ? "text-destructive bg-destructive/15" : ACTION_IDLE)}
        onClick={() => onRate("bad")}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={t("ai.sidebar.chat.actions.saveToDocuments")}
        className={cn(ACTION_CLASS, saved ? "text-accent bg-accent/15" : ACTION_IDLE)}
        onClick={onSave}
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={regenerating ? t("ai.sidebar.chat.actions.regenerating") : t("ai.sidebar.chat.actions.regenerate")}
        className={cn(ACTION_CLASS, ACTION_IDLE, "disabled:opacity-60")}
        disabled={regenerating}
        onClick={onRegenerate}
      >
        {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

interface ShurikAnswerTurnProps {
  message: AIMessage;
  /** Rendered under the text: sources, follow-ups, the actions row. */
  children?: ReactNode;
}

export function ShurikAnswerTurn({ message, children }: ShurikAnswerTurnProps) {
  const { t, i18n } = useTranslation();
  return (
    <div className="px-0 py-1.5 min-w-0 max-w-full">
      <ShurikBubble wink={isFreshAssistantReply(message, Date.now())}>
        <div className="flex items-center gap-1.5">
          <p className="text-caption font-medium text-foreground">{t("ai.sidebar.chat.ai")}</p>
          {/* A turn of the shared conversation comes from the server without a time. */}
          {message.timestamp ? (
            <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
              {new Date(message.timestamp).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
        <p
          data-shurik-answer-text
          className="mt-1 text-caption text-foreground/95 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full"
        >
          {message.content}
        </p>
        {children}
      </ShurikBubble>
    </div>
  );
}
