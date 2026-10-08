import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ShurikBubble } from "@/components/ai/ShurikBubble";
import { Button } from "@/components/ui/button";
import { isMoneyShurikMessage, readShurikMessageAction } from "@/data/shurik-messages-source";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { formatShurikMessageTime } from "@/lib/shurik-message-time";
import { cn } from "@/lib/utils";
import type { ShurikMessage } from "@/types/entities";

interface ShurikMessageListProps {
  /** Newest first. */
  messages: ShurikMessage[];
  onMarkRead: (ids: string[]) => void;
  /** After the message's button has sent the person to its page. */
  onAction?: () => void;
  className?: string;
}

/**
 * What Shurik wrote on his own. Opening the list reads every unread message loaded into it,
 * whether or not it has been scrolled into view; there is no per-message "mark read" control.
 */
export function ShurikMessageList({ messages, onMarkRead, onAction, className }: ShurikMessageListProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const visible = useDocumentVisible();
  // The stripe outlives the write: otherwise it would vanish the instant the list opens.
  const [seenUnreadIds, setSeenUnreadIds] = useState<ReadonlySet<string>>(() => new Set());

  const unreadKey = useMemo(
    () => messages.filter((message) => !message.is_read).map((message) => message.id).join("|"),
    [messages],
  );

  // Kept in a ref so that a new callback identity is not mistaken for a new unread message.
  const onMarkReadRef = useRef(onMarkRead);
  onMarkReadRef.current = onMarkRead;

  // One request per message per opening of the list: a refused write brings the row back
  // unread, and asking again would only be refused again.
  const requestedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || unreadKey === "") return;
    const ids = unreadKey.split("|").filter((id) => !requestedIdsRef.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) requestedIdsRef.current.add(id);
    setSeenUnreadIds((current) => new Set([...current, ...ids]));
    onMarkReadRef.current(ids);
  }, [unreadKey, visible]);

  if (messages.length === 0) {
    return (
      <p className={cn("py-6 text-center text-caption text-muted-foreground", className)}>
        {t("ai.notifications.empty")}
      </p>
    );
  }

  const now = new Date();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {messages.map((message) => {
        const action = readShurikMessageAction(message);
        const unread = !message.is_read || seenUnreadIds.has(message.id);
        return (
          <div key={message.id} data-testid={`shurik-message-${message.id}`} data-unread={unread}>
            <ShurikBubble pose={isMoneyShurikMessage(message) ? "money" : "default"} unread={unread}>
              <div className="flex items-baseline gap-1.5">
                <p className="text-caption font-semibold text-foreground">{t("ai.shurik.name")}</p>
                <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                  {formatShurikMessageTime(message.created_at, now, i18n.language, t("ai.notifications.yesterday"))}
                </span>
              </div>
              <p className="mt-0.5 max-w-full whitespace-pre-wrap break-words text-caption text-foreground/95 [overflow-wrap:anywhere]">
                {message.body?.trim() ? message.body : message.title}
              </p>
              {action && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-1.5 h-7 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-accent-foreground hover:bg-accent/90"
                  onClick={() => {
                    navigate(action.href);
                    onAction?.();
                  }}
                >
                  {action.label}
                </Button>
              )}
            </ShurikBubble>
          </div>
        );
      })}
    </div>
  );
}
