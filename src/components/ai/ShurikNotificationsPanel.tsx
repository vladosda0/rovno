import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ShurikMessageList } from "@/components/ai/ShurikMessageList";
import { ShurikUnreadBadge } from "@/components/ai/ShurikUnreadBadge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ShurikMessage } from "@/types/entities";

interface ShurikNotificationsPanelProps {
  /** Newest first. */
  messages: ShurikMessage[];
  unreadCount: number;
  onMarkRead: (ids: string[]) => void;
  onClose: () => void;
  /** After a message's button has sent the person to its page. */
  onAction?: () => void;
}

/**
 * Shurik's panel outside a project: what he wrote, and nothing to type into.
 * The chat lives only inside a project, so there are no tabs to switch here.
 */
export function ShurikNotificationsPanel({
  messages,
  unreadCount,
  onMarkRead,
  onClose,
  onAction,
}: ShurikNotificationsPanelProps) {
  const { t } = useTranslation();

  return (
    <aside
      aria-label={t("ai.notifications.title")}
      className="glass-sidebar sticky z-10 flex h-[calc(100svh-48px-var(--demo-banner-h,0px))] w-full shrink-0 flex-col overflow-hidden md:w-[420px] md:max-w-[45vw]"
      style={{ top: "calc(48px + var(--demo-banner-h, 0px))" }}
    >
      <div className="flex shrink-0 items-center gap-1.5 px-3 pb-1 pt-2">
        <h2 className="px-1 text-caption font-semibold text-foreground">{t("ai.notifications.title")}</h2>
        <ShurikUnreadBadge count={unreadCount} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={onClose}
          aria-label={t("ai.notifications.close")}
          title={t("ai.notifications.close")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ShurikMessageList messages={messages} onMarkRead={onMarkRead} onAction={onAction} className="px-3 py-2" />
      </ScrollArea>
    </aside>
  );
}
