import { X, ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ShurikHomeChat } from "@/components/ai/ShurikHomeChat";
import { ShurikMessageList } from "@/components/ai/ShurikMessageList";
import { SHURIK_PANEL_CARD_CLASS } from "@/components/ai/shurik-panel-card";
import { SHURIK_PANEL_TAB_IDS, ShurikPanelTabs, type ShurikPanelTab } from "@/components/ai/ShurikPanelTabs";
import { ShurikUnreadBadge } from "@/components/ai/ShurikUnreadBadge";
import { Button } from "@/components/ui/button";
import { NewFeatureBadge } from "@/components/ui/new-feature-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { markFeatureOpened } from "@/lib/new-features";
import { cn } from "@/lib/utils";
import type { ShurikMessage } from "@/types/entities";

export const SHURIK_OUTSIDE_CHAT_FEATURE = "shurik-outside-chat";

interface ShurikOutsidePanelProps {
  /** Newest first. */
  messages: ShurikMessage[];
  unreadCount: number;
  onMarkRead: (ids: string[]) => void;
  onClose: () => void;
  tab: ShurikPanelTab;
  onTabChange: (tab: ShurikPanelTab) => void;
  /** The signed-in person the chat belongs to. Null in demo and local modes: no server, no chat. */
  chatProfileId: string | null;
  /** After a message's button has sent the person to its page. */
  onAction?: () => void;
  /** Passed on to the list: whether a briefing carries the "Отчёт клиенту" button. */
  clientReportAvailable?: boolean;
}

/**
 * Shurik's panel outside a project (docs-library 6.5, frames 1, 4, 7): chat and notifications.
 * It is a panel of its own and not AISidebar in another mode: AISidebar lives on the project's
 * permissions, proposals and activity feed, none of which exist here. What they share, the look
 * of a conversation, the limit card and the tabs, are shared components.
 */
export function ShurikOutsidePanel({
  messages,
  unreadCount,
  onMarkRead,
  onClose,
  tab,
  onTabChange,
  chatProfileId,
  onAction,
  clientReportAvailable = false,
}: ShurikOutsidePanelProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const chatAvailable = chatProfileId !== null;
  const showNotifications = !chatAvailable || tab === "notifications";

  useEffect(() => {
    if (chatAvailable && !showNotifications) markFeatureOpened(SHURIK_OUTSIDE_CHAT_FEATURE);
  }, [chatAvailable, showNotifications]);

  const list = (
    <ShurikMessageList
      messages={messages}
      onMarkRead={onMarkRead}
      onAction={onAction}
      clientReportAvailable={clientReportAvailable}
      className="px-3 py-2"
    />
  );
  const close = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", !isMobile && "ml-auto")}
      onClick={onClose}
      aria-label={t("ai.home.closePanel")}
      title={t("ai.home.closePanel")}
    >
      {isMobile ? <ChevronLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
    </Button>
  );

  return (
    <aside
      aria-label={chatAvailable ? t("ai.home.title") : t("ai.notifications.title")}
      className={cn(SHURIK_PANEL_CARD_CLASS, "flex w-full shrink-0 flex-col overflow-hidden md:w-[420px] md:max-w-[45vw]")}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-1 pt-2">
        {isMobile && close}
        <h2 className="px-1 text-caption font-semibold text-foreground">
          {chatAvailable ? t("ai.home.title") : t("ai.notifications.title")}
        </h2>
        {!chatAvailable && <ShurikUnreadBadge count={unreadCount} />}
        {chatAvailable && (
          <div className="min-w-[14rem] flex-1">
            <ShurikPanelTabs
              tab={tab}
              onTabChange={onTabChange}
              unreadCount={unreadCount}
              chatMark={<NewFeatureBadge featureId={SHURIK_OUTSIDE_CHAT_FEATURE} />}
            />
          </div>
        )}
        {!isMobile && close}
      </div>
      {showNotifications && (
        <ScrollArea
          {...(chatAvailable
            ? {
                id: SHURIK_PANEL_TAB_IDS.notifications.panel,
                role: "tabpanel",
                "aria-labelledby": SHURIK_PANEL_TAB_IDS.notifications.tab,
              }
            : {})}
          className="min-h-0 flex-1"
        >
          {list}
        </ScrollArea>
      )}
      {/* Stays mounted behind «Уведомления», so a half-typed question is still there on the way back. */}
      {chatAvailable && (
        <div
          id={SHURIK_PANEL_TAB_IDS.chat.panel}
          role="tabpanel"
          aria-labelledby={SHURIK_PANEL_TAB_IDS.chat.tab}
          hidden={showNotifications}
          className={cn("flex min-h-0 min-w-0 flex-1 flex-col", showNotifications && "hidden")}
        >
          <ShurikHomeChat profileId={chatProfileId} visible={!showNotifications} onPageOpened={onAction} />
        </div>
      )}
    </aside>
  );
}
