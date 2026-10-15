import { Check, X as XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ShurikBubble } from "@/components/ai/ShurikBubble";
import { Button } from "@/components/ui/button";
import {
  hasShurikHintWords,
  resolveShurikHintAction,
  shurikHintButtonKey,
  shurikHintTextKey,
  shurikHintTextValues,
  type ShurikHintOfDay,
} from "@/lib/shurik-hints";

interface ShurikHintCardProps {
  hint: ShurikHintOfDay;
  projectId: string;
  /** The button of a hint that leads to a page. */
  onNavigate: (href: string) => void;
  /** The button of an "ask Shurik" hint: the question goes into the composer, it is not sent. */
  onAsk: (question: string) => void;
  /** The cross: closed until tomorrow. */
  onDismiss: () => void;
}

/**
 * Shurik's hint of the day over the conversation in a project chat: one thought, one button,
 * a cross. When the server says the hint's reason is gone (`done`), the button gives way to a
 * green "Сделано. Так держать!" until the end of the day.
 */
export function ShurikHintCard({ hint, projectId, onNavigate, onAsk, onDismiss }: ShurikHintCardProps) {
  const { t, i18n } = useTranslation();
  const action = resolveShurikHintAction(hint, projectId);
  if (!action || !hasShurikHintWords((key) => i18n.exists(key), hint.hint_key)) return null;
  const text = t(shurikHintTextKey(hint.hint_key), shurikHintTextValues(hint.params, i18n.language));
  const done = hint.status === "done";

  return (
    <div data-testid="shurik-hint-card" data-hint-key={hint.hint_key} data-status={hint.status}>
      <ShurikBubble pose={done ? "done" : "default"}>
        <div className="flex items-start gap-1.5">
          <p className="text-caption font-semibold text-foreground">{t("ai.shurik.name")}</p>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("shurikHints.dismiss")}
            title={t("shurikHints.dismiss")}
            className="-mr-1 -mt-0.5 ml-auto shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-0.5 text-caption leading-snug text-foreground [overflow-wrap:anywhere]">{text}</p>
        {done ? (
          <p data-testid="shurik-hint-done" className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-success">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {t("shurikHints.done")}
          </p>
        ) : (
          <Button
            type="button"
            size="sm"
            className="mt-1.5 h-8 rounded-lg bg-accent px-3 text-[11px] font-medium text-accent-foreground hover:bg-accent/90 md:h-7 md:px-2.5"
            onClick={() => {
              if (action.kind === "ask") onAsk(t(action.questionKey));
              else onNavigate(action.href);
            }}
          >
            {t(shurikHintButtonKey(hint.hint_key))}
          </Button>
        )}
      </ShurikBubble>
    </div>
  );
}
