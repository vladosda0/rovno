import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Send, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ChatMessage } from "@/components/ai/ChatMessage";
import { ResultCard } from "@/components/ai/ResultCard";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { CreditDisplay } from "@/components/ai/CreditDisplay";
import { useCurrentUser } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { generateProposal, getTextResponse } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIMessage } from "@/types/ai";
import type { CommitResult } from "@/lib/commit-proposal";
import { useIsMobile } from "@/hooks/use-mobile";

const PROJECT_SUGGESTIONS = ["Add tasks", "Update estimate", "Generate contract", "Buy materials"];
const GLOBAL_SUGGESTIONS = ["Create project", "Compare estimates", "Best tile adhesive?"];

const STORAGE_KEY = "ai-sidebar-width";
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 360;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 48;

interface CommitResultMessage {
  id: string;
  result: CommitResult;
  timestamp: string;
}

export function AISidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isProjectContext = location.pathname.startsWith("/project/");
  const projectId = isProjectContext ? location.pathname.split("/")[2] : "";
  const title = isProjectContext ? "Project AI" : "Global AI";

  const user = useCurrentUser();
  const perm = isProjectContext ? usePermission(projectId) : null;

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [commitResults, setCommitResults] = useState<Map<string, CommitResultMessage>>(new Map());
  const [inputValue, setInputValue] = useState("");
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(stored))) : DEFAULT_WIDTH;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setMessages([]);
    setCommitResults(new Map());
  }, [location.pathname]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, commitResults]);

  // Persist width
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  // Drag resize handler
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: width };
    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startW + delta));
      setWidth(newW);
    };
    const handleMouseUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width]);

  const totalCredits = user.credits_free + user.credits_paid;

  function handleSend(text?: string) {
    const content = (text ?? inputValue).trim();
    if (!content) return;
    setInputValue("");

    if (totalCredits <= 0) {
      setLimitModalOpen(true);
      return;
    }

    if (isProjectContext && perm && !perm.can("ai.generate")) {
      toast({ title: "Access denied", description: "You don't have permission to use AI generation.", variant: "destructive" });
      return;
    }

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    let proposal = isProjectContext ? generateProposal(content, projectId) : null;
    const assistantContent = proposal ? "Here's what I'd do:" : getTextResponse();

    const assistantMsg: AIMessage = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
      proposal: proposal ?? undefined,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  }

  function handleConfirm(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposal) return m;
        const result = commitProposal(m.proposal);
        if (result.success) {
          toast({ title: "Changes applied", description: `${result.count} change${(result.count ?? 0) !== 1 ? "s" : ""} committed.` });
          // Store the commit result for rendering
          setCommitResults((prev) => {
            const next = new Map(prev);
            next.set(msgId, {
              id: `result-${Date.now()}`,
              result,
              timestamp: new Date().toISOString(),
            });
            return next;
          });
          return { ...m, proposal: { ...m.proposal, status: "confirmed" as const } };
        } else {
          toast({ title: "Failed", description: result.error, variant: "destructive" });
          return m;
        }
      })
    );
  }

  function handleCancel(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.proposal) return m;
        toast({ title: "Proposal cancelled", description: "No changes were made." });
        return { ...m, proposal: { ...m.proposal, status: "cancelled" as const } };
      })
    );
  }

  const suggestions = isProjectContext ? PROJECT_SUGGESTIONS : GLOBAL_SUGGESTIONS;
  const panelWidth = collapsed ? COLLAPSED_WIDTH : (isMobile ? "100%" : width);

  return (
    <>
      <div
        className="glass-sidebar flex flex-col h-[calc(100svh-48px)] shrink-0 relative box-border"
        style={{
          width: panelWidth,
          minWidth: collapsed ? COLLAPSED_WIDTH : (isMobile ? "100%" : MIN_WIDTH),
          maxWidth: collapsed ? COLLAPSED_WIDTH : (isMobile ? "100%" : MAX_WIDTH),
          top: 48,
          position: "sticky",
          zIndex: 10,
          overflow: "hidden",
        }}
      >
        {/* Collapse toggle region */}
        {collapsed ? (
          <div className="flex flex-col items-center py-3 gap-2">
            <button
              onClick={() => setCollapsed(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
            >
              <Bot className="h-4 w-4 text-accent" />
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 space-y-3 shrink-0 box-border" style={{ width: "100%" }}>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <Bot className="h-4 w-4 text-accent" />
                  </div>
                  <span className="text-body-sm font-semibold text-sidebar-foreground truncate">{title}</span>
                </div>
                <button
                  onClick={() => setCollapsed(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-caption shrink-0"
                  title="Collapse"
                >
                  ✕
                </button>
              </div>
              <CreditDisplay onLimitReached={() => setLimitModalOpen(true)} />
            </div>

            {/* Chat content — single scroll region */}
            <div className="flex-1 min-h-0 overflow-hidden px-4 box-border" style={{ width: "100%" }}>
              <ScrollArea className="h-full">
                <div ref={scrollRef} className="space-y-3 py-2 pr-1" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center py-8">
                      <Bot className="mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-body-sm text-muted-foreground">
                        {isProjectContext
                          ? "Ask about this project — tasks, estimates, documents..."
                          : "Create a project, get recommendations, or ask anything."}
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="w-full min-w-0">
                        <ChatMessage
                          message={msg}
                          onConfirm={() => handleConfirm(msg.id)}
                          onCancel={() => handleCancel(msg.id)}
                        />
                        {/* Post-commit result log */}
                        {commitResults.has(msg.id) && (() => {
                          const cr = commitResults.get(msg.id)!;
                          const allItems = [...cr.result.created, ...cr.result.updated];
                          return (
                            <div className="mt-2 w-full min-w-0">
                              <ResultCard
                                summary={`${cr.result.count} change${(cr.result.count ?? 0) !== 1 ? "s" : ""} applied`}
                                items={allItems}
                                timestamp={cr.timestamp}
                                canNavigate={!perm || perm.can("ai.generate")}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Footer */}
            <div className="p-4 space-y-2 shrink-0 box-border" style={{ width: "100%" }}>
              {messages.length === 0 && (
                <SuggestionChips suggestions={suggestions} onSelect={(s) => handleSend(s)} />
              )}
              <div className="flex gap-1.5 w-full min-w-0">
                <Input
                  placeholder="Ask AI..."
                  className="h-9 text-body-sm bg-sidebar-accent/50 border-sidebar-border flex-1 min-w-0"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => handleSend()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Resize handle — desktop only */}
        {!collapsed && !isMobile && (
          <div
            onMouseDown={handleMouseDown}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/20 transition-colors z-20 flex items-center justify-center group"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={limitModalOpen}
        onOpenChange={setLimitModalOpen}
        title="Credit limit reached"
        description="You've used all available credits. Upgrade your plan to continue using AI features."
        confirmLabel="Upgrade"
        onConfirm={() => {
          setLimitModalOpen(false);
          navigate("/pricing");
        }}
        onCancel={() => setLimitModalOpen(false)}
      />
    </>
  );
}
