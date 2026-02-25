import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Send, GripVertical, Bell, Camera, X as XIcon, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import { ChatMessage } from "@/components/ai/ChatMessage";
import { ResultCard } from "@/components/ai/ResultCard";
import { WorkLog } from "@/components/ai/WorkLog";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { EventFeedItem } from "@/components/ai/EventFeedItem";
import { NotificationDrawer } from "@/components/ai/NotificationDrawer";
import { ContextInspector } from "@/components/ai/ContextInspector";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { useCurrentUser, useEvents, useNotifications } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { generateProposal, getTextResponse } from "@/lib/ai-engine";
import { commitProposal } from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIMessage, ProposalChange } from "@/types/ai";
import type { CommitResult } from "@/lib/commit-proposal";
import { useIsMobile } from "@/hooks/use-mobile";
import { isAuthenticated } from "@/lib/auth-state";
import {
  subscribePhotoConsult, closePhotoConsult, buildConsultPrompt,
  type PhotoConsultContext,
} from "@/lib/photo-consult-store";
import { addTask, addComment as addTaskComment, addEvent, getCurrentUser, getStages } from "@/data/store";
import { format } from "date-fns";

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

interface AISidebarProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

const DEV_MODE = localStorage.getItem("dev-context-inspector") === "true";

// Photo consult AI analysis mock result
interface PhotoAnalysisResult {
  stepAlignment: string;
  observations: string;
  issues: { text: string; severity: "Low" | "Med" | "High" }[];
  nextStep: string;
  confidence: string;
}

function mockPhotoAnalysis(ctx: PhotoConsultContext): PhotoAnalysisResult {
  const taskTitle = ctx.task?.title ?? "standalone photo";
  const checklist = ctx.task?.checklist ?? [];
  const doneItems = checklist.filter((c) => c.done);
  const nextItem = checklist.find((c) => !c.done);

  return {
    stepAlignment: nextItem
      ? `Corresponds to checklist item: "${nextItem.text}"`
      : doneItems.length > 0
        ? `All ${doneItems.length} checklist items completed`
        : "No checklist items to align with",
    observations: `Photo "${ctx.photo.caption}" shows progress on ${taskTitle}. ${
      ctx.siblingPhotos?.length ? `${ctx.siblingPhotos.length} other photo(s) in this task for comparison.` : ""
    }`,
    issues: [
      { text: "Minor alignment issue visible in left section", severity: "Low" as const },
      ...(Math.random() > 0.5
        ? [{ text: "Potential moisture concern near joint area", severity: "Med" as const }]
        : []),
    ],
    nextStep: nextItem
      ? `Proceed with: "${nextItem.text}"`
      : "Task checklist complete — consider marking as Done",
    confidence: "High — recommend additional close-up angle of joint area for verification",
  };
}

function buildSuggestedActions(ctx: PhotoConsultContext, analysis: PhotoAnalysisResult): ProposalChange[] {
  const actions: ProposalChange[] = [];

  // If there are medium/high severity issues, suggest a fix task
  const hasIssues = analysis.issues.some((i) => i.severity !== "Low");
  if (hasIssues) {
    actions.push({
      entity_type: "task",
      action: "create",
      label: `Fix issue: ${ctx.photo.caption}`,
      after: "not_started",
    });
  }

  // Always suggest an observation comment
  if (ctx.task) {
    actions.push({
      entity_type: "comment",
      action: "create",
      label: "Add AI observation comment to task",
    });
  }

  // If all checklist items are done and task is in_progress, suggest marking done
  if (ctx.task && ctx.task.status === "in_progress") {
    const allDone = ctx.task.checklist.length > 0 && ctx.task.checklist.every((c) => c.done);
    if (allDone) {
      actions.push({
        entity_type: "task",
        action: "update",
        label: "Mark task Done",
        before: "in_progress",
        after: "done",
      });
    }
  }

  return actions;
}

export function AISidebar({ collapsed, onCollapsedChange }: AISidebarProps) {
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

  // Photo consult state
  const [photoConsult, setPhotoConsult] = useState<PhotoConsultContext | null>(null);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [photoAnalysisLoading, setPhotoAnalysisLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<ProposalChange[]>([]);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());

  // Subscribe to photo consult events
  useEffect(() => {
    return subscribePhotoConsult((ctx) => {
      if (ctx) {
        setPhotoConsult(ctx);
        setPhotoAnalysis(null);
        setSuggestedActions([]);
        setSelectedActions(new Set());
        onCollapsedChange(false);
        setActiveTab("ai");

        // Prefill the prompt
        const prompt = buildConsultPrompt(ctx);
        setInputValue(prompt);

        // Auto-run analysis
        setPhotoAnalysisLoading(true);
        setTimeout(() => {
          const analysis = mockPhotoAnalysis(ctx);
          setPhotoAnalysis(analysis);
          setPhotoAnalysisLoading(false);

          const actions = buildSuggestedActions(ctx, analysis);
          setSuggestedActions(actions);
          // Select all by default
          setSelectedActions(new Set(actions.map((_, i) => i)));
        }, 2000);
      } else {
        setPhotoConsult(null);
        setPhotoAnalysis(null);
        setSuggestedActions([]);
        setSelectedActions(new Set());
      }
    });
  }, [onCollapsedChange]);

  // Activity events
  const allEvents = useEvents(projectId || "");
  const events = isProjectContext ? allEvents : [];

  useEffect(() => {
    setMessages([]);
    setCommitResults(new Map());
    setWorkLogs(new Map());
    // Don't clear photo consult on navigation - it should persist
  }, [location.pathname]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, commitResults, workLogs, photoAnalysis]);

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

    // Clear photo consult when sending (prompt was used)
    if (photoConsult) {
      setPhotoConsult(null);
    }

    if (totalCredits <= 0) {
      setLimitModalOpen(true);
      return;
    }

    if (isProjectContext && perm && !perm.can("ai.generate")) {
      toast({ title: "Access denied", description: "You don't have permission to use AI generation.", variant: "destructive" });
      return;
    }

    setActiveTab("ai");

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };

    const workLogId = `wl-${Date.now()}`;
    setWorkLogs((prev) => {
      const next = new Map(prev);
      next.set(workLogId, { id: workLogId, steps: WORK_STEPS_GENERATE, phase: "generate" });
      return next;
    });

    setMessages((prev) => [...prev, userMsg]);

    setTimeout(() => {
      const proposal = isProjectContext ? generateProposal(content, projectId) : null;
      const assistantContent = proposal ? "Here's what I'd do:" : getTextResponse();

      const assistantMsg: AIMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: assistantContent,
        timestamp: new Date().toISOString(),
        proposal: proposal ?? undefined,
      };

      setWorkLogs((prev) => {
        const next = new Map(prev);
        next.delete(workLogId);
        return next;
      });
      setMessages((prev) => [...prev, assistantMsg]);
    }, WORK_STEPS_GENERATE.length * 600 + 200);
  }

  function handleConfirm(msgId: string) {
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

  // Photo consult: confirm suggested actions
  function handleConsultConfirm() {
    if (!photoConsult) return;
    const currentUser = getCurrentUser();
    const stages = getStages(photoConsult.photo.project_id);
    const stage = stages[0];
    let appliedCount = 0;

    selectedActions.forEach((idx) => {
      const action = suggestedActions[idx];
      if (!action) return;

      if (action.entity_type === "task" && action.action === "create") {
        const taskId = `task-ai-${Date.now()}-${idx}`;
        addTask({
          id: taskId,
          project_id: photoConsult.photo.project_id,
          stage_id: photoConsult.task?.stage_id ?? stage?.id ?? "",
          title: action.label,
          description: `AI-identified issue from photo: ${photoConsult.photo.caption}`,
          status: "not_started",
          assignee_id: currentUser.id,
          checklist: [],
          comments: [],
          attachments: [],
          photos: [photoConsult.photo.id],
          linked_estimate_item_ids: [],
          created_at: new Date().toISOString(),
        });
        appliedCount++;
      }

      if (action.entity_type === "comment" && action.action === "create" && photoConsult.task) {
        addTaskComment(
          photoConsult.task.id,
          `AI Photo Analysis: ${photoAnalysis?.observations ?? "Analysis complete"}`
        );
        appliedCount++;
      }

      if (action.entity_type === "task" && action.action === "update" && photoConsult.task) {
        import("@/data/store").then(({ updateTask }) => {
          updateTask(photoConsult.task!.id, { status: "done" as const });
        });
        appliedCount++;
      }
    });

    toast({ title: "Changes applied", description: `${appliedCount} action${appliedCount !== 1 ? "s" : ""} committed.` });
    closePhotoConsult();
  }

  function handleConsultCancel() {
    setSuggestedActions([]);
    setSelectedActions(new Set());
  }

  function toggleActionSelection(idx: number) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const suggestions = isProjectContext ? PROJECT_SUGGESTIONS : GLOBAL_SUGGESTIONS;
  const panelWidth = collapsed ? COLLAPSED_WIDTH : (isMobile ? "100%" : width);

  // Filter events
  const FILTER_TYPES = ["task", "estimate", "document", "photo", "member"];
  const filteredEvents = activityFilter
    ? events.filter((e) => e.type.startsWith(activityFilter!))
    : events;

  const roleLabel = perm?.role === "owner" ? "Owner" : perm?.role === "contractor" ? "Contractor" : perm?.role === "participant" ? "Viewer" : null;

  const placeholderColors = [
    "bg-accent/10", "bg-info/10", "bg-warning/10", "bg-muted",
    "bg-success/10", "bg-destructive/10",
  ];

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
            {isProjectContext && (
              <button
                onClick={() => onCollapsedChange(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors"
              >
                <PanelLeft className="h-4 w-4 text-accent" />
              </button>
            )}
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
                  <span className="text-body-sm font-semibold text-sidebar-foreground truncate">
                    {photoConsult ? "Photo Consult" : title}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isGuest && (
                    <span className={`text-caption font-bold px-1.5 py-0.5 rounded-pill ${totalCredits < 10 ? "bg-warning/15 text-warning" : "bg-accent/10 text-accent"}`}>
                      {totalCredits}
                    </span>
                  )}
                  {roleLabel && (
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-pill px-1.5 py-0.5">
                      {roleLabel}
                    </span>
                  )}
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
                  {isProjectContext && !photoConsult && (
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
                      {photoConsult ? (
                        /* === Photo Consult Mode === */
                        <div ref={scrollRef} className="space-y-3 py-2 pr-1" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
                          {/* Pinned photo card */}
                          <div className="glass rounded-card p-2.5 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className={`h-12 w-12 rounded-lg shrink-0 ${placeholderColors[0]} flex items-center justify-center`}>
                                <Camera className="h-5 w-5 text-muted-foreground/30" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-body-sm font-semibold text-foreground truncate">{photoConsult.photo.caption}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {format(new Date(photoConsult.photo.created_at), "MMM d, yyyy · HH:mm")}
                                </p>
                                {photoConsult.task && (
                                  <p className="text-[10px] text-accent truncate mt-0.5">
                                    Task: {photoConsult.task.title}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => closePhotoConsult()}
                                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                              >
                                <XIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Loading skeleton */}
                          {photoAnalysisLoading && (
                            <div className="glass rounded-card p-3 space-y-2.5 animate-pulse">
                              <div className="h-3 bg-muted rounded w-3/4" />
                              <div className="h-3 bg-muted rounded w-full" />
                              <div className="h-3 bg-muted rounded w-5/6" />
                              <div className="h-3 bg-muted rounded w-2/3" />
                              <div className="h-3 bg-muted rounded w-4/5" />
                            </div>
                          )}

                          {/* Analysis result */}
                          {photoAnalysis && !photoAnalysisLoading && (
                            <div className="glass rounded-card p-3 space-y-3">
                              <p className="text-body-sm font-semibold text-foreground">AI Photo Analysis</p>

                              {/* Step alignment */}
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Step Alignment</p>
                                <p className="text-caption text-foreground">{photoAnalysis.stepAlignment}</p>
                              </div>

                              {/* Observations */}
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Observations</p>
                                <p className="text-caption text-foreground">{photoAnalysis.observations}</p>
                              </div>

                              {/* Issues */}
                              {photoAnalysis.issues.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Potential Issues</p>
                                  <div className="space-y-1">
                                    {photoAnalysis.issues.map((issue, i) => (
                                      <div key={i} className="flex items-start gap-2 text-caption">
                                        <span className={`shrink-0 rounded-full px-1.5 py-0 text-[10px] font-bold ${
                                          issue.severity === "High" ? "bg-destructive/15 text-destructive" :
                                          issue.severity === "Med" ? "bg-warning/15 text-warning" :
                                          "bg-muted text-muted-foreground"
                                        }`}>
                                          {issue.severity}
                                        </span>
                                        <span className="text-foreground">{issue.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Next step */}
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Suggested Next Step</p>
                                <p className="text-caption text-foreground">{photoAnalysis.nextStep}</p>
                              </div>

                              {/* Confidence */}
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Confidence</p>
                                <p className="text-caption text-foreground">{photoAnalysis.confidence}</p>
                              </div>
                            </div>
                          )}

                          {/* Suggested actions */}
                          {suggestedActions.length > 0 && !photoAnalysisLoading && (
                            <div className="space-y-2">
                              <PreviewCard summary="Suggested actions" changes={suggestedActions} />

                              {/* Selectable checkboxes */}
                              <div className="space-y-1 px-1">
                                {suggestedActions.map((action, idx) => (
                                  <label
                                    key={idx}
                                    className="flex items-center gap-2 text-caption cursor-pointer hover:bg-muted/30 rounded-md px-1.5 py-1 transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedActions.has(idx)}
                                      onChange={() => toggleActionSelection(idx)}
                                      className="rounded border-border"
                                    />
                                    <span className="text-foreground">{action.label}</span>
                                  </label>
                                ))}
                              </div>

                              <ActionBar
                                onConfirm={handleConsultConfirm}
                                onCancel={handleConsultCancel}
                                disabled={selectedActions.size === 0}
                              />
                            </div>
                          )}
                        </div>
                      ) : activeTab === "ai" ? (
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
                  {activeTab === "ai" && messages.length === 0 && !photoConsult && (
                    <SuggestionChips suggestions={suggestions} onSelect={(s) => handleSend(s)} />
                  )}
                  <div className="flex gap-1.5 w-full min-w-0">
                    <Input
                      placeholder={photoConsult ? "Edit prompt or send as-is..." : "Ask AI..."}
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
