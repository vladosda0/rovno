import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shurik } from "@/components/ai/Shurik";
import type { ShurikPanelTab } from "@/components/ai/ShurikPanelTabs";
import { ShurikUnreadBadge } from "@/components/ai/ShurikUnreadBadge";
import {
  countUnreadShurikMessages,
  isBriefingShurikMessage,
  isClientReportReminderShurikMessage,
  isMoneyShurikMessage,
  isPeopleShurikMessage,
} from "@/data/shurik-messages-source";
import { useDocumentVisible } from "@/hooks/use-document-visible";
import { useIsMobile } from "@/hooks/use-mobile";
import { shurikOpenLabel } from "@/lib/shurik-open-label";
import { readPeekedShurikMessageIds, rememberPeekedShurikMessageIds } from "@/lib/shurik-peek-storage";
import type { ShurikMessage } from "@/types/entities";

/** How long the first line of a new message stays next to Shurik. */
export const SHURIK_PEEK_MS = 8000;

/** Below this width (`md`) the hanging Shurik is not drawn, so nothing next to him would be seen. */
const HANGING_SHURIK_MIN_WIDTH_PX = 768;

interface ShurikPeek {
  message: ShurikMessage;
  /** Above one when the line stands for a batch of briefings: the number of projects in it. */
  briefingProjects: number;
  /** The same for a batch of report reminders. */
  reportProjects: number;
}

function projectsOf(messages: ShurikMessage[], isKind: (message: ShurikMessage) => boolean): number {
  if (messages.length === 0 || !isKind(messages[0])) return 0;
  return new Set(messages.filter(isKind).map((message) => message.project_id)).size;
}

/**
 * The newest unread message whose first line has not been shown yet, for SHURIK_PEEK_MS.
 * Showing it is remembered per person on this device, so a later visit does not repeat it.
 */
function useShurikPeek(messages: ShurikMessage[], enabled: boolean): ShurikPeek | null {
  const [peek, setPeek] = useState<{ id: string; briefingProjects: number; reportProjects: number } | null>(null);

  useEffect(() => {
    // Read at this moment, not from `useIsMobile`, which only knows the width after the first paint.
    if (!enabled || window.innerWidth < HANGING_SHURIK_MIN_WIDTH_PX) return;
    const unread = messages.filter((message) => !message.is_read);
    if (unread.length === 0) return;

    const userId = unread[0].user_id;
    const shown = readPeekedShurikMessageIds(userId);
    const fresh = unread.filter((message) => !shown.has(message.id));
    if (fresh.length === 0) return;

    // Several at once get one line, the newest; the number on Shurik speaks for the rest.
    // Briefings come one per project at the same minute, so their one line names how many.
    rememberPeekedShurikMessageIds(userId, fresh.map((message) => message.id));
    setPeek({
      id: fresh[0].id,
      briefingProjects: projectsOf(fresh, isBriefingShurikMessage),
      reportProjects: projectsOf(fresh, isClientReportReminderShurikMessage),
    });
  }, [enabled, messages]);

  const peekId = peek?.id ?? null;
  useEffect(() => {
    if (!peekId) return;
    const timer = setTimeout(() => setPeek(null), SHURIK_PEEK_MS);
    return () => clearTimeout(timer);
  }, [peekId]);

  if (!peek) return null;
  const message = messages.find((candidate) => candidate.id === peek.id && !candidate.is_read);
  return message
    ? { message, briefingProjects: peek.briefingProjects, reportProjects: peek.reportProjects }
    : null;
}

interface ShurikFloatProps {
  /** Newest first. */
  messages: ShurikMessage[];
  /** With a tab when the click is about messages; without one the panel opens where it was left. */
  onOpen: (tab?: ShurikPanelTab) => void;
}

/** Shurik hanging in the bottom-left corner while his panel is closed. Tablet width and up. */
export function ShurikFloat({ messages, onOpen }: ShurikFloatProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const documentVisible = useDocumentVisible();
  const unreadCount = countUnreadShurikMessages(messages);
  const peek = useShurikPeek(messages, documentVisible && !isMobile);
  const moneyPeek = peek !== null && isMoneyShurikMessage(peek.message);
  // A message about a person names its project in the first line; what was done is in the text.
  const peopleText = peek !== null && isPeopleShurikMessage(peek.message)
    ? peek.message.body?.trim() || null
    : null;
  const open = () => onOpen(unreadCount > 0 ? "notifications" : undefined);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={shurikOpenLabel(t, unreadCount)}
        title={t("ai.shurik.open")}
        className="fixed bottom-4 left-4 z-30 hidden rounded-xl drop-shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:block"
      >
        {/* A money message is no moment for a thumbs-up wink: he stands still until the line is gone. */}
        <Shurik pose={moneyPeek ? "money" : "default"} motion={moneyPeek ? "still" : "idle"} decorative />
        <ShurikUnreadBadge count={unreadCount} className="absolute -right-0.5 top-0" />
      </button>
      {peek && (
        <button
          type="button"
          data-testid="shurik-peek"
          onClick={() => onOpen("notifications")}
          className="fixed bottom-9 left-[84px] z-30 hidden max-w-[200px] rounded-xl rounded-bl-[4px] border border-border bg-card px-2.5 py-1.5 text-left text-[11px] leading-snug text-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
        >
          {peopleText ? (
            <>
              <span className="block font-semibold [overflow-wrap:anywhere]">{peek.message.title}</span>
              <span className="line-clamp-2 [overflow-wrap:anywhere]">{peopleText}</span>
            </>
          ) : (
            <>
              <span className="block font-semibold">{t("ai.shurik.name")}</span>
              <span className="line-clamp-2 [overflow-wrap:anywhere]">
                {peek.briefingProjects > 1
                  ? t("ai.notifications.briefingBatch", { count: peek.briefingProjects })
                  : peek.reportProjects > 1
                    ? t("ai.notifications.clientReportBatch", { count: peek.reportProjects })
                    : peek.message.title}
              </span>
            </>
          )}
        </button>
      )}
    </>
  );
}
