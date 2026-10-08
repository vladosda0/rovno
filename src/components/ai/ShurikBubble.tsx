import type { ReactNode } from "react";
import { Shurik, type ShurikPose } from "@/components/ai/Shurik";
import { cn } from "@/lib/utils";
import type { AIMessage } from "@/types/ai";

/** How long after it was written an assistant reply still counts as just arrived. */
export const SHURIK_FRESH_REPLY_MS = 3000;

export function isFreshAssistantReply(message: Pick<AIMessage, "role" | "timestamp">, nowMs: number) {
  if (message.role !== "assistant") return false;
  const writtenAt = Date.parse(message.timestamp);
  if (Number.isNaN(writtenAt)) return false;
  const age = nowMs - writtenAt;
  return age >= 0 && age < SHURIK_FRESH_REPLY_MS;
}

interface ShurikBubbleProps {
  /** Wink once on mount: for a reply that has just arrived. */
  wink?: boolean;
  pose?: ShurikPose;
  /** Accent stripe on the left edge: a message from Shurik the person has not seen yet. */
  unread?: boolean;
  className?: string;
  children: ReactNode;
}

export function ShurikBubble({ wink = false, pose = "default", unread = false, className, children }: ShurikBubbleProps) {
  return (
    <div data-testid="shurik-bubble" className={cn("flex min-w-0 max-w-full items-end gap-1.5", className)}>
      <Shurik pose={pose} motion={wink ? "wink" : "still"} decorative />
      <div
        className={cn(
          "min-w-0 flex-1 rounded-2xl rounded-bl-[4px] border border-border bg-card px-2.5 py-2",
          unread && "border-accent/45 shadow-[inset_3px_0_0_hsl(var(--accent))]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
