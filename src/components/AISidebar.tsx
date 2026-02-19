import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Send, GripVertical, Bell, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import { ChatMessage } from "@/components/ai/ChatMessage";
import { ResultCard } from "@/components/ai/ResultCard";
import { WorkLog } from "@/components/ai/WorkLog";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { CreditDisplay } from "@/components/ai/CreditDisplay";
import { EventFeedItem } from "@/components/ai/EventFeedItem";
import { NotificationDrawer } from "@/components/ai/NotificationDrawer";
import { ContextInspector } from "@/components/ai/ContextInspector";
import { useCurrentUser, useEvents, useNotifications } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { generateProposal, getTextResponse } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIMessage } from "@/types/ai";
import type { CommitResult } from "@/lib/commit-proposal";
import { useIsMobile } from "@/hooks/use-mobile";
import { isAuthenticated } from "@/lib/auth-state";

const PROJECT_SUGGESTIONS = ["Add tasks", "Update estimate", "Generate contract", "Buy materials"];
const GLOBAL_SUGGESTIONS = ["Create project", "Compare estimates", "Best tile adhesive?"];

const STORAGE_KEY = "ai-sidebar-width";
const TAB_STORAGE_KEY = "ai-sidebar-tab";
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 360;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 48;

const WORK_STEPS_GENERATE = ["Reading project state", "Checking permissions", "Drafting proposal", "Estimating credits", "Ready for review"];
const WORK_STEPS_COMMIT = ["Applying changes", "Writing event log", "Updating context pack", "Done"];

type SidebarTab = "ai" | "activity";

interface CommitResultMessage {
  id: string;
  result: CommitResult;
  timestamp: string;
}

interface WorkLogEntry {
  id: string;
  steps: string[];
  phase: "generate" | "commit";
}

const DEV_MODE = localStorage.getItem("dev-context-inspector") === "true";

export function AISidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isProjectContext = location.pathname.startsWith("/project/");
  const projectId = isProjectContext ? location.pathname.split("/")[2] : "";
  const title = "Project AI";

  const isGuest = !isAuthenticated();
  const user = useCurrentUser();
  const permResult = usePermission(projectId || "");
  const perm = isProjectContext && !isGuest ? permResult : null;
  const { unreadCount } = useNotifications();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [commitResults, setCommitResults] = useState<Map<string, CommitResultMessage>>(new Map());
  const [workLogs, setWorkLogs] = useState<Map<string, WorkLogEntry>>(new Map());
  const [inputValue, setInputValue] = useState("");
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>(() => {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    return (stored === "activity" ? "activity" : "ai") as SidebarTab;
  });
  const [activityFilter, setActivityFilter] = useState<string | null>(null);
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(stored))) : DEFAULT_WIDTH;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Activity events
  const allEvents = useEvents(projectId || "");
  const events = isProjectContext ? allEvents : [];

  useEffect(() => {
    setMessages([]);
    setCommitResults(new Map());
    setWorkLogs(new Map());
  }, [location.pathname]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, commitResults, workLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

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

    // Switch to AI tab
    setActiveTab("ai");

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    // Show work log for generation
    const workLogId = `wl-${Date.now()}`;
    setWorkLogs((prev) => {
      const next = new Map(prev);
      next.set(workLogId, { id: workLogId, steps: WORK_STEPS_GENERATE, phase: "generate" });
      return next;
    });

    setMessages((prev) => [...prev, userMsg]);

    // Simulate delay for proposal generation
    setTimeout(() => {
      let proposal = isProjectContext ? generateProposal(content, projectId) : null;
      const assistantContent = proposal ? "Here's what I'd do:" : getTextResponse();

      const assistantMsg: AIMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
        proposal: proposal ?? undefined,
      };

      // Remove work log, add assistant message
      setWorkLogs((prev) => {
        const next = new Map(prev);
        next.delete(workLogId);
        return next;
      });
      setMessages((prev) => [...prev, assistantMsg]);
    }, WORK_STEPS_GENERATE.length * 600 + 200);
  }

  function handleConfirm(msgId: string) {
    // Show commit work log
    const commitWlId = `wl-commit-${Date.now()}`;
    setWorkLogs((prev) => {
      const next = new Map(prev);
      next.set(commitWlId, { id: commitWlId, steps: WORK_STEPS_COMMIT, phase: "commit" });
      return next;
    });

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== msgId || !m.proposal) return m;
          const result = commitProposal(m.proposal);
          if (result.success) {
            toast({ title: "Changes applied", description: `${result.count} change${(result.count ?? 0) !== 1 ? "s" : ""} committed.` });
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
      setWorkLogs((prev) => {
        const next = new Map(prev);
        next.delete(commitWlId);
        return next;
      });
    }, WORK_STEPS_COMMIT.length * 600 + 200);
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

  // Filter events
  const FILTER_TYPES = ["task", "estimate", "document", "photo", "member"];
  const filteredEvents = activityFilter
    ? events.filter((e) => e.type.startsWith(activityFilter!))
    : events;

  const roleLabel = perm?.role === "owner" ? "Owner" : perm?.role === "contractor" ? "Contractor" : perm?.role === "participant" ? "Viewer" : null;

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
            {/* === HEADER (sticky) === */}
            <div className="p-3 space-y-2 shrink-0 box-border border-b border-border" style={{ width: "100%" }}>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <span className="text-body-sm font-semibold text-sidebar-foreground truncate">{title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Credits badge */}
                  {!isGuest && (
                    <span className={`text-caption font-bold px-1.5 py-0.5 rounded-pill ${totalCredits < 10 ? "bg-warning/15 text-warning" : "bg-accent/10 text-accent"}`}>
                      {totalCredits}
                    </span>
                  )}
                  {/* Role badge */}
                  {roleLabel && (
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-pill px-1.5 py-0.5">
                      {roleLabel}
                    </span>
                  )}
                  {/* Notification bell */}
                  {!isGuest && (
                    <button
                      onClick={() => setNotifOpen(true)}
                      className="relative h-7 w-7 flex items-center justify-center rounded-lg hover:bg-accent/10 transition-colors"
                    >
                      <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  )}
                  {/* Collapse */}
                  <button
                    onClick={() => setCollapsed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors text-caption shrink-0 h-7 w-7 flex items-center justify-center"
                    title="Collapse"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            {/* Guest overlay */}
            {isGuest ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                <div className="glass rounded-card p-sp-3 space-y-sp-2">
                  <Bot className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="text-body-sm font-semibold text-foreground">AI Assistant is locked</p>
                  <p className="text-caption text-muted-foreground">Log in to use AI features.</p>
                  <Button
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    onClick={() => navigate("/auth/login")}
                  >
                    Log in to use AI
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* === MAIN BODY with tabs === */}
                <div className="flex-1 min-h-0 flex flex-col" style={{ width: "100%" }}>
                  {/* Tab switcher */}
                  {isProjectContext && (
                    <div className="px-3 pt-2 shrink-0">
                      <div className="glass rounded-lg p-0.5 flex gap-0.5">
                        <button
                          onClick={() => setActiveTab("ai")}
                          className={`flex-1 rounded-md px-3 py-1.5 text-caption font-medium transition-colors ${
                            activeTab === "ai"
                              ? "bg-accent/15 text-accent"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          AI
                        </button>
                        <button
                          onClick={() => setActiveTab("activity")}
                          className={`flex-1 rounded-md px-3 py-1.5 text-caption font-medium transition-colors ${
                            activeTab === "activity"
                              ? "bg-accent/15 text-accent"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Activity
                          {events.length > 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground">{events.length}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Scrollable content */}
                  <div className="flex-1 min-h-0 overflow-hidden px-3 box-border" style={{ width: "100%" }}>
                    <ScrollArea className="h-full">
                      {activeTab === "ai" ? (
                        /* === AI Chat Tab === */
                        <div ref={scrollRef} className="space-y-3 py-2 pr-1" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {messages.length === 0 && workLogs.size === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-8">
                              <Bot className="mb-3 h-10 w-10 text-muted-foreground/40" />
                              <p className="text-body-sm text-muted-foreground">
                                {isProjectContext
                                  ? "Ask about this project — tasks, estimates, documents..."
                                  : "Create a project, get recommendations, or ask anything."}
                              </p>
                            </div>
                          ) : (
                            <>
                              {messages.map((msg) => (
                                <div key={msg.id} className="w-full min-w-0">
                                  <ChatMessage
                                    message={msg}
                                    onConfirm={() => handleConfirm(msg.id)}
                                    onCancel={() => handleCancel(msg.id)}
                                  />
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
                              ))}
                              {/* Active work logs */}
                              {Array.from(workLogs.values()).map((wl) => (
                                <div key={wl.id} className="w-full min-w-0">
                                  <WorkLog steps={wl.steps} />
                                </div>
                              ))}
                            </>
                          )}

                          {/* Dev-only context inspector */}
                          {DEV_MODE && isProjectContext && (
                            <ContextInspector projectId={projectId} />
                          )}
                        </div>
                      ) : (
                        /* === Activity Tab === */
                        <div className="space-y-2 py-2 pr-1">
                          {/* Filters */}
                          <div className="flex flex-wrap gap-1">
                            <button
                              onClick={() => setActivityFilter(null)}
                              className={`rounded-pill px-2.5 py-0.5 text-caption font-medium transition-colors border ${
                                !activityFilter
                                  ? "bg-accent/15 text-accent border-accent/20"
                                  : "bg-transparent text-muted-foreground border-border hover:border-accent/20"
                              }`}
                            >
                              All
                            </button>
                            {FILTER_TYPES.map((ft) => (
                              <button
                                key={ft}
                                onClick={() => setActivityFilter(activityFilter === ft ? null : ft)}
                                className={`rounded-pill px-2.5 py-0.5 text-caption font-medium transition-colors border capitalize ${
                                  activityFilter === ft
                                    ? "bg-accent/15 text-accent border-accent/20"
                                    : "bg-transparent text-muted-foreground border-border hover:border-accent/20"
                                }`}
                              >
                                {ft}
                              </button>
                            ))}
                          </div>

                          {/* Event list */}
                          {filteredEvents.length === 0 ? (
                            <p className="text-caption text-muted-foreground text-center py-8">
                              No activity yet
                            </p>
                          ) : (
                            <div className="glass rounded-card divide-y divide-border">
                              {filteredEvents.map((evt) => (
                                <EventFeedItem key={evt.id} event={evt} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>

                {/* === COMPOSER (sticky bottom) === */}
                <div className="p-3 space-y-2 shrink-0 box-border border-t border-border" style={{ width: "100%" }}>
                  {activeTab === "ai" && messages.length === 0 && (
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

            {/* Notification Drawer overlay */}
            <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
          </>
        )}

        {/* Resize handle */}
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