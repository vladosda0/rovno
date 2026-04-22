import { useTranslation } from "react-i18next";
import { useActivityNotificationsBridge, useNotificationEventMap } from "@/hooks/use-activity-source";
import { markNotificationRead } from "@/data/store";
import { EventFeedItem } from "./EventFeedItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, Bell } from "lucide-react";

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const { t } = useTranslation();
  const { notifications, bridges } = useActivityNotificationsBridge();
  const eventMap = useNotificationEventMap(bridges);

  if (!open) return null;

  const allEvents = notifications
    .map((notification) => ({
      notification,
      event: eventMap[notification.id],
    }))
    .filter((entry) => entry.event);

  return (
    <div className="absolute inset-0 z-30 flex flex-col glass-elevated rounded-none">
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-accent" />
          <span className="text-body-sm font-semibold text-foreground">{t("ai.notifications.title")}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {allEvents.length === 0 ? (
            <p className="text-caption text-muted-foreground text-center py-6">{t("ai.notifications.empty")}</p>
          ) : (
            allEvents.map(({ notification, event }) => (
              <div
                key={notification.id}
                className={`relative ${!notification.is_read ? "bg-accent/5 rounded-lg" : ""}`}
                onClick={() => {
                  if (!notification.is_read) markNotificationRead(notification.id);
                }}
              >
                <EventFeedItem event={event!} compact />
                {!notification.is_read && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-accent" />
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
