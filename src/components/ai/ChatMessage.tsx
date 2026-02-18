import { Bot } from "lucide-react";
import type { AIMessage } from "@/types/ai";
import { PreviewCard } from "./PreviewCard";
import { ActionBar } from "./ActionBar";

interface ChatMessageProps {
  message: AIMessage;
  onConfirm?: () => void;
  onCancel?: () => void;
  onNewVersion?: () => void;
}

export function ChatMessage({ message, onConfirm, onCancel, onNewVersion }: ChatMessageProps) {
  const isUser = message.role === "user";
  const proposal = message.proposal;
  const isPending = proposal?.status === "pending";

  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-accent" />
        </div>
      )}
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? "items-end" : ""}`}>
        <div
          className={`rounded-card px-3 py-2 text-body-sm ${
            isUser
              ? "bg-accent/10 text-foreground ml-auto"
              : "glass text-foreground"
          }`}
        >
          {message.content}
        </div>
        {proposal && (
          <div className="space-y-1">
            <PreviewCard summary={proposal.summary} changes={proposal.changes} />
            {isPending && onConfirm && onCancel && (
              <ActionBar
                onConfirm={onConfirm}
                onCancel={onCancel}
                onNewVersion={onNewVersion}
                showNewVersion={proposal.type === "update_estimate"}
              />
            )}
            {proposal.status === "confirmed" && (
              <span className="text-caption text-success">✓ Confirmed</span>
            )}
            {proposal.status === "cancelled" && (
              <span className="text-caption text-muted-foreground">✗ Cancelled</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
