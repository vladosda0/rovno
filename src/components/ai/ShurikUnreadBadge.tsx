import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 99;

interface ShurikUnreadBadgeProps {
  count: number;
  /** `sm` is the 13px pill for the 30px figure in the phone top bar. */
  size?: "md" | "sm";
  className?: string;
}

export function ShurikUnreadBadge({ count, size = "md", className }: ShurikUnreadBadgeProps) {
  const { t } = useTranslation();
  if (count <= 0) return null;

  return (
    <span
      data-testid="shurik-unread-badge"
      aria-label={t("ai.notifications.unreadCount", { count })}
      className={cn(
        "inline-grid place-items-center rounded-full bg-[hsl(4_74%_52%)] font-bold leading-none text-white",
        size === "sm" ? "h-[13px] min-w-[13px] px-[3px] text-[9px]" : "h-4 min-w-4 px-1 text-[10px]",
        className,
      )}
    >
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
}
