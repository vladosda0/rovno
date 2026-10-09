import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ShurikBubble } from "@/components/ai/ShurikBubble";
import { Button } from "@/components/ui/button";
import {
  isBriefingShurikMessage,
  isMoneyShurikMessage,
  readShurikBriefingLines,
  readShurikMessageAction,
  type ShurikBriefingLine,
} from "@/data/shurik-messages-source";
import type { ShurikPose } from "@/components/ai/Shurik";
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

function messagePose(message: ShurikMessage): ShurikPose {
  if (isMoneyShurikMessage(message)) return "money";
  return isBriefingShurikMessage(message) ? "notice" : "default";
}

const MESSAGE_TEXT_CLASS = "max-w-full break-words text-caption text-foreground/95 [overflow-wrap:anywhere]";

/** A briefing: the project line, then what needs attention, names opening what they name. */
function BriefingText({
  message,
  lines,
  onAction,
}: {
  message: ShurikMessage;
  /** Null when the payload could not be read: the plain text stands in. */
  lines: ShurikBriefingLine[] | null;
  onAction?: () => void;
}) {
  return (
    <div className="mt-0.5">
      <p data-testid="shurik-briefing-title" className="text-[13px] font-bold text-foreground [overflow-wrap:anywhere]">
        {message.title}
      </p>
      {lines ? (
        <ul className={cn("list-disc pl-4", MESSAGE_TEXT_CLASS)}>
          {lines.map((line, lineIndex) => (
            <li key={lineIndex}>
              {line.parts.map((part, partIndex) =>
                part.href ? (
                  <Link
                    key={partIndex}
                    to={part.href}
                    state={part.taskId ? { openTaskId: part.taskId } : undefined}
                    onClick={onAction}
                    className="rounded-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {part.text}
                  </Link>
                ) : (
                  <span key={partIndex}>{part.text}</span>
                ),
              )}
            </li>
          ))}
        </ul>
      ) : (
        message.body?.trim() && <p className={cn("whitespace-pre-wrap", MESSAGE_TEXT_CLASS)}>{message.body}</p>
      )}
    </div>
  );
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
            <ShurikBubble pose={messagePose(message)} unread={unread}>
              <div className="flex items-baseline gap-1.5">
                <p className="text-caption font-semibold text-foreground">{t("ai.shurik.name")}</p>
                <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                  {formatShurikMessageTime(message.created_at, now, i18n.language, t("ai.notifications.yesterday"))}
                </span>
              </div>
              {isBriefingShurikMessage(message) ? (
                <BriefingText message={message} lines={readShurikBriefingLines(message)} onAction={onAction} />
              ) : (
                <p className={cn("mt-0.5 whitespace-pre-wrap", MESSAGE_TEXT_CLASS)}>
                  {message.body?.trim() ? message.body : message.title}
                </p>
              )}
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
