import type { TFunction } from "i18next";

/** The spoken name of a button that opens Shurik: says how much is unread when anything is. */
export function shurikOpenLabel(t: TFunction, unreadCount: number): string {
  return unreadCount > 0
    ? `${t("ai.shurik.open")}, ${t("ai.notifications.unreadCount", { count: unreadCount })}`
    : t("ai.shurik.open");
}
