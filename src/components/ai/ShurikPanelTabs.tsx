import { useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ShurikUnreadBadge } from "@/components/ai/ShurikUnreadBadge";
import { cn } from "@/lib/utils";

export type ShurikPanelTab = "chat" | "notifications";

/** DOM ids that tie each tab to the panel it shows. The panel is one per page. */
export const SHURIK_PANEL_TAB_IDS = {
  chat: { tab: "shurik-tab-chat", panel: "shurik-tabpanel-chat" },
  notifications: { tab: "shurik-tab-notifications", panel: "shurik-tabpanel-notifications" },
} as const satisfies Record<ShurikPanelTab, { tab: string; panel: string }>;

const TAB_ORDER: ShurikPanelTab[] = ["chat", "notifications"];

interface ShurikPanelTabsProps {
  tab: ShurikPanelTab;
  onTabChange: (tab: ShurikPanelTab) => void;
  unreadCount: number;
}

export function ShurikPanelTabs({ tab, onTabChange, unreadCount }: ShurikPanelTabsProps) {
  const { t } = useTranslation();
  const buttonsRef = useRef<Partial<Record<ShurikPanelTab, HTMLButtonElement | null>>>({});
  const labels: Record<ShurikPanelTab, string> = {
    chat: t("ai.panel.tab.chat"),
    notifications: t("ai.notifications.title"),
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: ShurikPanelTab) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TAB_ORDER[(TAB_ORDER.indexOf(current) + step + TAB_ORDER.length) % TAB_ORDER.length];
    onTabChange(next);
    buttonsRef.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={t("ai.panel.tabs.label")} className="flex gap-1 rounded-[10px] bg-muted/50 p-0.5">
      {TAB_ORDER.map((key) => {
        const selected = key === tab;
        return (
          <button
            key={key}
            ref={(node) => {
              buttonsRef.current[key] = node;
            }}
            type="button"
            role="tab"
            id={SHURIK_PANEL_TAB_IDS[key].tab}
            aria-selected={selected}
            aria-controls={SHURIK_PANEL_TAB_IDS[key].panel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(key)}
            onKeyDown={(event) => onKeyDown(event, key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1 text-caption font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {labels[key]}
            {key === "notifications" && <ShurikUnreadBadge count={unreadCount} />}
          </button>
        );
      })}
    </div>
  );
}
