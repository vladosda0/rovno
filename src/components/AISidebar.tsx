import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import { getEventGroupTimestampMs } from "@/lib/event-activity-timestamp";
import {
  Bot,
  Send,
  GripVertical,
  Camera,
  X as XIcon,
  PanelLeft,
  Plus,
  Paperclip,
  GraduationCap,
  AtSign,
  Link2,
  Mic,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  User,
  Copy,
  ThumbsUp,
  ThumbsDown,
  BookmarkPlus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmModal } from "@/components/ConfirmModal";
import { WorkLog } from "@/components/ai/WorkLog";
import { SuggestionChips } from "@/components/ai/SuggestionChips";
import { EventFeedItem } from "@/components/ai/EventFeedItem";
import { GroundingCallout } from "@/components/ai/GroundingCallout";
import { WorkProposalPreview } from "@/components/ai/WorkProposalPreview";
import { isAIEvent } from "@/components/ai/event-utils";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { ProposalQueueCard, type ProposalQueueItemState, type ProposalDecision } from "@/components/ai/ProposalQueueCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser, useEvents, useProject, useProjects, useTasks, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useWorkspaceProfilePreferences } from "@/hooks/use-workspace-source";
import { useEstimateV2FinanceProjectSummaryFromWorkspace } from "@/hooks/use-estimate-v2-data";
import { useProcurementReadProjectSummary } from "@/hooks/use-procurement-read-model";
import {
  getProjectDomainAccess,
  projectDomainAllowsView,
  usePermission,
} from "@/lib/permissions";
import {
  buildAIProjectContext,
  evaluateProjectTargetedSendReadiness,
  type AIContextInputs,
} from "@/lib/ai-project-context";
import {
  invokeLiveTextAssistant,
  pickInferenceMode,
  resolveAiAssistantUiLanguage,
  shouldUseHostedLiveTextAssistantPath,
  userVisibleLiveTextAssistantError,
  type AiAssistantUiLanguage,
} from "@/lib/ai-assistant-client";
import {
  getOrCreateProjectChatSessionId,
  rotateProjectChatSessionId,
} from "@/lib/ai-project-chat-session";
import {
  buildArchivePreviewLines,
  clearProjectTranscript,
  isPersistableAiProjectId,
  loadProjectChatArchives,
  loadProjectTranscript,
  prependProjectChatArchive,
  saveProjectTranscript,
  trimMessagesForArchive,
  type AiChatArchiveEntryV1,
} from "@/lib/ai-chat-transcript-storage";
import { generateProposalQueue, getTextResponse, reviseProposalWithEdits } from "@/lib/ai-engine";
import {
  commitPhotoConsultActions,
  commitProposal,
  filterPhotoConsultProposalChangesBySeam,
  type PhotoConsultApplyAction,
} from "@/lib/commit-proposal";
import { toast } from "@/hooks/use-toast";
import type { AIMessage, AIProposal, ProposalChange } from "@/types/ai";
import type { Event } from "@/types/entities";
import { useIsMobile } from "@/hooks/use-mobile";
import { getProfileAutomationLevelMode, isAuthenticated, setProfileAutomationLevelMode } from "@/lib/auth-state";
import {
  subscribePhotoConsult, closePhotoConsult, buildConsultPrompt, getPhotoConsultContext,
  type PhotoConsultContext,
} from "@/lib/photo-consult-store";
import {
  addEvent, addDocument, addDocumentVersion,
  getStages, getUserById, updateProject, getDocuments,
} from "@/data/store";
import { format, isToday, isYesterday } from "date-fns";
import { MVP_SHOW_AI_AUTOMATION_MODE_UI } from "@/lib/mvp-ai-automation-ui";

const PROJECT_SUGGESTIONS = ["Add tasks", "Update estimate", "Generate contract", "Buy materials"];
const GLOBAL_SUGGESTIONS = ["Create project", "Compare estimates", "Best tile adhesive?"];

const STORAGE_KEY = "ai-sidebar-width";
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 360;
const MAX_WIDTH = 520;
const COLLAPSED_WIDTH = 48;

const WORK_STEPS_GENERATE = ["Reading project state", "Checking permissions", "Drafting proposal", "Estimating credits", "Ready for review"];
const WORK_STEPS_HOSTED_CONSULT = ["Checking access", "Reading visible project context", "Preparing answer"];
const WORK_STEPS_COMMIT = ["Applying changes", "Writing event log", "Updating context pack", "Done"];
const AUTOMATION_MODE_TO_LEVEL: Record<AutomationMode, 1 | 2 | 3 | 4> = {
  full: 1,
  assisted: 2,
  manual: 3,
  observer: 4,
};
const VALID_AUTOMATION_MODES: Set<AutomationMode> = new Set(["full", "assisted", "manual", "observer"]);
const COMPOSER_MAX_HEIGHT = 220;
const GENERAL_MODE_VALUE = "general";
const ACTIONABLE_PROPOSAL_PATTERN = /\b(task|add task|create task|estimate|cost|budget|procurement|buy|purchase|material|document|contract|report|generate)\b/i;
const LEARN_USER_PROMPT_PATTERN = /^\s*(how|what|why|explain|как|что|почему|объясни|объясните)\b/i;
const LEARN_LIST_PATTERN = /(?:^|\n)\s*(?:[-*•]|\d+\.)\s+/m;

type FeedFilter =
  | "all"
  | "chats"
  | "task"
  | "estimate"
  | "document"
  | "photo"
  | "member"
  | "ai_actions"
  | "learn";

type ChatFeedDomainFilter = "task" | "estimate" | "document" | "photo" | "member";

const FEED_CHAT_DOMAIN_MARKERS: Record<ChatFeedDomainFilter, readonly string[]> = {
  task: ["task", "tasks", "checklist", "todo", "задач", "чеклист", "этап"],
  estimate: [
    "estimate",
    "budget",
    "cost",
    "pricing",
    "subscription",
    "money",
    "spent",
    "spend",
    "смета",
    "бюджет",
    "стоимост",
    "затрат",
    "расход",
    "денег",
    "потратил",
    "подписк",
    "сколько стоит",
  ],
  document: ["document", "pdf", "contract", "file", "документ", "файл", "договор"],
  photo: ["photo", "image", "picture", "camera", "фото", "изображен", "снимок"],
  member: ["member", "participant", "crew", "team", "участник", "бригада", "исполнитель"],
};

function normalizeChatFeedText(text: string): string {
  return text.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
}

function collectLearnRelatedMessageIds(messages: readonly AIMessage[]): Set<string> {
  const ids = new Set<string>();
  const isLearnExplicit = (message: AIMessage) => (
    message.mode === "learn"
    || ((message as AIMessage & { meta?: { mode?: string } }).meta?.mode === "learn")
  );
  const isLearnLikeUser = (message: AIMessage) => (
    message.role === "user" && LEARN_USER_PROMPT_PATTERN.test(message.content.trim())
  );
  const isLearnLikeAssistant = (message: AIMessage) => (
    message.role === "assistant"
    && (message.content.length >= 240 || LEARN_LIST_PATTERN.test(message.content))
  );

  messages.forEach((message, index) => {
    const qualifies = isLearnExplicit(message) || isLearnLikeUser(message) || isLearnLikeAssistant(message);
    if (!qualifies) return;

    ids.add(message.id);
    if (message.role === "user") {
      for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
        if (messages[nextIndex]?.role === "assistant") {
          ids.add(messages[nextIndex].id);
          break;
        }
      }
    } else {
      for (let prevIndex = index - 1; prevIndex >= 0; prevIndex -= 1) {
        if (messages[prevIndex]?.role === "user") {
          ids.add(messages[prevIndex].id);
          break;
        }
      }
    }
  });
  return ids;
}

function messageMatchesChatFeedDomain(message: AIMessage, domain: ChatFeedDomainFilter): boolean {
  const n = normalizeChatFeedText(message.content);
  return FEED_CHAT_DOMAIN_MARKERS[domain].some((marker) => n.includes(marker));
}

function transcriptMatchesChatFeedDomain(
  messages: readonly AIMessage[],
  domain: ChatFeedDomainFilter,
): boolean {
  return messages.some((m) => messageMatchesChatFeedDomain(m, domain));
}

/** Live-text / proposal signals that belong in “AI actions” alongside AI-tagged events. */
function messageHasAiActionSignals(message: AIMessage): boolean {
  if (message.proposal !== undefined) return true;
  const lt = message.liveTextAssistantV1;
  if (lt?.workProposal?.proposalTitle?.trim()) return true;
  if (lt?.workProposal?.suggestedWorkItems && lt.workProposal.suggestedWorkItems.length > 0) {
    return true;
  }
  return false;
}

function transcriptHasAiActionSignals(messages: readonly AIMessage[]): boolean {
  return messages.some(messageHasAiActionSignals);
}

/** Live thread above collapsible activity — same subset rules as former in-feed chat rows. */
function selectMessagesForActivityFilter(
  filter: FeedFilter,
  allMessages: AIMessage[],
  learnSubset: AIMessage[],
): AIMessage[] {
  switch (filter) {
    case "all":
    case "chats":
      return allMessages;
    case "learn":
      return learnSubset;
    case "ai_actions":
      return allMessages.filter(messageHasAiActionSignals);
    case "task":
    case "estimate":
    case "document":
    case "photo":
    case "member":
      return allMessages.filter((m) => messageMatchesChatFeedDomain(m, filter));
    default:
      return allMessages;
  }
}

function archiveEntryMatchesFeedFilter(
  entry: AiChatArchiveEntryV1,
  filter: FeedFilter,
): boolean {
  const snap = entry.messagesSnapshot;
  switch (filter) {
    case "all":
    case "chats":
      return true;
    case "learn":
      return collectLearnRelatedMessageIds(snap).size > 0;
    case "ai_actions":
      return (
        transcriptHasAiActionSignals(snap)
        || entry.feedHints?.aiActions === true
        || entry.feedHints?.hadDocumentOrPhotoAnalysis === true
      );
    case "task":
    case "estimate":
    case "document":
    case "photo":
    case "member":
      return transcriptMatchesChatFeedDomain(snap, filter);
    default:
      return false;
  }
}

type ActiveWindow = "none" | "worklog" | "proposal_queue" | "photo_consult";
type AutomationMode = "full" | "assisted" | "manual" | "observer";
type VoiceState = "idle" | "listening" | "processing";
type StreamRowTier = 1 | 2 | 3;

interface ProposalExecutionGroupMeta {
  summary?: string;
  proposalId?: string;
  childEventIds: string[];
}

interface StreamProposalGroupRow {
  id: string;
  kind: "proposal_group";
  tier: StreamRowTier;
  timestampMs: number;
  timestamp: string;
  proposalEvent: Event;
  summary: string;
  summaryLines: string[];
  childEvents: Event[];
}

interface StreamEventRow {
  id: string;
  kind: "event";
  tier: StreamRowTier;
  timestampMs: number;
  timestamp: string;
  event: Event;
}

interface StreamStatusRow {
  id: string;
  kind: "status";
  tier: StreamRowTier;
  timestampMs: number;
  timestamp: string;
  title: string;
  detail?: string;
}

interface StreamStockUsedRow {
  id: string;
  kind: "stock_used";
  tier: StreamRowTier;
  timestampMs: number;
  timestamp: string;
  event: Event;
  title: string;
  summary: string;
  detailLines: string[];
}

interface StreamArchivedChatRow {
  id: string;
  kind: "archived_chat";
  tier: StreamRowTier;
  timestampMs: number;
  timestamp: string;
  archiveEntry: AiChatArchiveEntryV1;
}

type StreamRow =
  | StreamProposalGroupRow
  | StreamEventRow
  | StreamStatusRow
  | StreamStockUsedRow
  | StreamArchivedChatRow;

interface DayBucket {
  key: string;
  label: string;
  rows: StreamRow[];
  olderThanYesterday: boolean;
}

/** Default number of most-recent calendar day buckets shown in the activity feed. */
const INITIAL_VISIBLE_DAY_BUCKETS = 3;
/** Each "Load more" reveals this many additional older day buckets. */
const LOAD_MORE_DAY_BUCKET_INCREMENT = 7;

const AUTOMATION_OPTIONS: { mode: AutomationMode; label: string; description: string }[] = [
  {
    mode: "manual",
    label: "Manual Control",
    description: "Maximum user oversight.",
  },
  {
    mode: "assisted",
    label: "Assisted",
    description: "AI groups actions, user confirms once.",
  },
  {
    mode: "observer",
    label: "Proactive",
    description: "More editing shortcuts in the review queue. Risky changes still require your confirmation.",
  },
  {
    mode: "full",
    label: "Autopilot",
    description: "Faster review UX; each change is still confirmed before it is applied.",
  },
];

interface WorkLogEntry {
  id: string;
  steps: string[];
  phase: "generate" | "commit";
}

interface ProposalQueueState {
  messageId: string;
  items: ProposalQueueItemState[];
  activeIndex: number;
  phase: "review" | "revising" | "executing";
  executionCursor: number;
  retryByItemId: Record<string, number>;
  executionErrorByItemId: Record<string, string>;
}

interface ScopedAISidebarState {
  messages: AIMessage[];
  workLogs: WorkLogEntry[];
  proposalQueue: ProposalQueueState | null;
  pendingGeneralProposalInput: string | null;
  inputValue: string;
  proposalExecutionLinks: Record<string, ProposalExecutionGroupMeta>;
  photoConsult: PhotoConsultContext | null;
  photoAnalysis: PhotoAnalysisResult | null;
  suggestedActions: ProposalChange[];
  selectedActions: number[];
}

interface AISidebarProps {
  collapsed: boolean;
  onCollapsedChange: (next: boolean) => void;
}

const scopedSidebarStateByKey = new Map<string, ScopedAISidebarState>();

function getSidebarScopeKey(pathname: string): string {
  if (pathname.startsWith("/project/")) {
    return `project:${pathname.split("/")[2] ?? ""}`;
  }
  if (pathname === "/home") {
    return "home";
  }
  return "global";
}

function createEmptyScopedSidebarState(): ScopedAISidebarState {
  return {
    messages: [],
    workLogs: [],
    proposalQueue: null,
    pendingGeneralProposalInput: null,
    inputValue: "",
    proposalExecutionLinks: {},
    photoConsult: null,
    photoAnalysis: null,
    suggestedActions: [],
    selectedActions: [],
  };
}

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

function normalizeAutomationMode(value: string | null | undefined): AutomationMode | null {
  if (!value) return null;
  return VALID_AUTOMATION_MODES.has(value as AutomationMode) ? (value as AutomationMode) : null;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toTimestampMs(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function getDayKey(timestampMs: number): string {
  return format(new Date(timestampMs), "yyyy-MM-dd");
}

function getDayLabel(timestampMs: number): string {
  const date = new Date(timestampMs);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMM d, yyyy");
}

function buildProposalSummaryLines(childEvents: Event[]): string[] {
  let taskCount = 0;
  let documentCount = 0;
  let procurementCount = 0;
  let hasEstimateUpdate = false;

  childEvents.forEach((event) => {
    if (event.type === "task_created") taskCount += 1;
    if (event.type === "document_created" || event.type === "document_uploaded") documentCount += 1;
    if (event.type === "procurement_created") procurementCount += 1;
    if (event.type === "estimate_created" || event.type === "estimate_approved") hasEstimateUpdate = true;
  });

  const lines: string[] = [];
  if (taskCount > 0) lines.push(`${taskCount} task${taskCount === 1 ? "" : "s"} created`);
  if (documentCount > 0) lines.push(`${documentCount} document${documentCount === 1 ? "" : "s"} drafted`);
  if (hasEstimateUpdate) lines.push("Estimate updated");
  if (procurementCount > 0) lines.push(`Procurement: ${procurementCount} item${procurementCount === 1 ? "" : "s"} added`);

  if (lines.length > 0) return lines.slice(0, 4);

  const fallbackTitles = childEvents
    .map((event) => {
      const payload = event.payload as Record<string, unknown>;
      return [payload.title, payload.caption, payload.text, payload.name]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 2);

  return fallbackTitles.length > 0 ? fallbackTitles : ["Execution completed"];
}

function liveAssistantPermissionsLine(
  gate: "loading" | "unavailable",
  lang: AiAssistantUiLanguage,
): string {
  if (gate === "loading") {
    return lang === "ru"
      ? "Загружаются права для этого проекта. Попробуйте через короткое время."
      : "Still loading your permissions for this project. Try again in a moment.";
  }
  return lang === "ru"
    ? "Ассистент не может использовать контекст проекта сейчас (нет прав)."
    : "AI can't use this project context right now (permissions unavailable).";
}

function liveAssistantNoProjectDataLine(lang: AiAssistantUiLanguage): string {
  return lang === "ru"
    ? "Данные проекта для контекста ИИ пока недоступны. Попробуйте чуть позже."
    : "Project data is not available yet for AI context. Try again shortly.";
}

export function AISidebar({ collapsed, onCollapsedChange }: AISidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isProjectContext = location.pathname.startsWith("/project/");
  const isHomeContext = location.pathname === "/home";
  const projectId = isProjectContext ? location.pathname.split("/")[2] : "";
  const scopeKey = useMemo(() => getSidebarScopeKey(location.pathname), [location.pathname]);

  const isGuest = !isAuthenticated();
  const user = useCurrentUser();
  const workspaceMode = useWorkspaceMode();
  const workspaceProfilePreferences = useWorkspaceProfilePreferences();
  const profileAssistantLang = resolveAiAssistantUiLanguage(workspaceProfilePreferences?.aiOutputLanguage);
  const projects = useProjects();
  const [homeProjectMode, setHomeProjectMode] = useState<string>(GENERAL_MODE_VALUE);

  const resolvedPermissionProjectId = useMemo(() => {
    if (isProjectContext) return projectId;
    if (isHomeContext && homeProjectMode !== GENERAL_MODE_VALUE) return homeProjectMode;
    return "";
  }, [isProjectContext, isHomeContext, projectId, homeProjectMode]);

  const permResult = usePermission(resolvedPermissionProjectId);
  const perm = isProjectContext && !isGuest ? permResult : null;
  /** Workspace seam for the project AI is addressing (project route or home project picker). */
  const seamForProjectCommit =
    !isGuest && resolvedPermissionProjectId ? permResult.seam : undefined;

  const { project, members } = useProject(projectId || "");
  const tasks = useTasks(projectId || "");
  const { project: ctxProject, members: ctxMembers, stages: ctxStages } = useProject(resolvedPermissionProjectId);
  const ctxTasks = useTasks(resolvedPermissionProjectId);
  const ctxEventsFull = useEvents(resolvedPermissionProjectId);
  const ctxHrReadsEnabled = resolvedPermissionProjectId
    ? projectDomainAllowsView(getProjectDomainAccess(permResult.seam, "hr"))
    : false;
  const ctxFinanceSummary = useEstimateV2FinanceProjectSummaryFromWorkspace(
    resolvedPermissionProjectId,
    ctxProject ?? null,
    { hrReadsEnabled: ctxHrReadsEnabled },
  );
  const ctxProcurementSummary = useProcurementReadProjectSummary(resolvedPermissionProjectId);

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [workLogs, setWorkLogs] = useState<Map<string, WorkLogEntry>>(new Map());
  const [proposalQueue, setProposalQueue] = useState<ProposalQueueState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<FeedFilter>("all");
  const [learnMode, setLearnMode] = useState(false);
  const [automationMode, setAutomationMode] = useState<AutomationMode>("manual");
  const [pendingGeneralProposalInput, setPendingGeneralProposalInput] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [tagPersonCursor, setTagPersonCursor] = useState(0);
  const [referenceTaskCursor, setReferenceTaskCursor] = useState(0);
  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(stored))) : DEFAULT_WIDTH;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const latestEventIdRef = useRef<string | null>(null);
  const initializedEventsRef = useRef(false);
  const knownEventIdsRef = useRef<Set<string>>(new Set());
  const highlightTimersRef = useRef<Map<string, number>>(new Map());
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const executingQueueRef = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceTimersRef = useRef<number[]>([]);
  const regenerateTimersRef = useRef<number[]>([]);
  const photoAnalysisTimerRef = useRef<number | null>(null);
  const previousScopeKeyRef = useRef(scopeKey);
  const latestScopedStateRef = useRef<ScopedAISidebarState>(createEmptyScopedSidebarState());
  const startPhotoConsultRef = useRef<((ctx: PhotoConsultContext) => void) | null>(null);
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set());
  const [proposalExecutionLinks, setProposalExecutionLinks] = useState<Record<string, ProposalExecutionGroupMeta>>({});
  const [expandedProposalEventIds, setExpandedProposalEventIds] = useState<Set<string>>(new Set());
  const [expandedStockUsedEventIds, setExpandedStockUsedEventIds] = useState<Set<string>>(new Set());
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set());
  const [visibleDayBucketCount, setVisibleDayBucketCount] = useState(INITIAL_VISIBLE_DAY_BUCKETS);
  const [messageRatings, setMessageRatings] = useState<Record<string, "good" | "bad" | undefined>>({});
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [chatArchives, setChatArchives] = useState<AiChatArchiveEntryV1[]>([]);
  const [expandedArchiveChatId, setExpandedArchiveChatId] = useState<string | null>(null);

  // Photo consult state
  const [photoConsult, setPhotoConsult] = useState<PhotoConsultContext | null>(null);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [photoAnalysisLoading, setPhotoAnalysisLoading] = useState(false);
  const [suggestedActions, setSuggestedActions] = useState<ProposalChange[]>([]);
  const [selectedActions, setSelectedActions] = useState<Set<number>>(new Set());

  const clearPhotoAnalysisTimer = useCallback(() => {
    if (photoAnalysisTimerRef.current !== null) {
      window.clearTimeout(photoAnalysisTimerRef.current);
      photoAnalysisTimerRef.current = null;
    }
  }, []);

  const clearVoiceTimers = useCallback(() => {
    voiceTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    voiceTimersRef.current = [];
  }, []);

  const clearRegenerateTimers = useCallback(() => {
    regenerateTimersRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    regenerateTimersRef.current = [];
  }, []);

  const startPhotoConsult = useCallback((ctx: PhotoConsultContext) => {
    clearPhotoAnalysisTimer();
    setPhotoConsult(ctx);
    setPhotoAnalysis(null);
    setPhotoAnalysisLoading(true);
    setSuggestedActions([]);
    setSelectedActions(new Set());
    setInputValue(buildConsultPrompt(ctx));

    photoAnalysisTimerRef.current = window.setTimeout(() => {
      if (!seamForProjectCommit || seamForProjectCommit.projectId !== ctx.photo.project_id) {
        setPhotoConsult(null);
        setPhotoAnalysis(null);
        setPhotoAnalysisLoading(false);
        setSuggestedActions([]);
        setSelectedActions(new Set());
        closePhotoConsult(ctx.photo.project_id);
        toast({
          title: "Access denied",
          description: "Project permissions are still loading or unavailable.",
          variant: "destructive",
        });
        photoAnalysisTimerRef.current = null;
        return;
      }
      if (!isGuest && !permResult.can("ai.generate")) {
        setPhotoConsult(null);
        setPhotoAnalysis(null);
        setPhotoAnalysisLoading(false);
        setSuggestedActions([]);
        setSelectedActions(new Set());
        closePhotoConsult(ctx.photo.project_id);
        toast({
          title: "Access denied",
          description: "You don't have permission to use AI photo consult.",
          variant: "destructive",
        });
        photoAnalysisTimerRef.current = null;
        return;
      }

      const analysis = mockPhotoAnalysis(ctx);
      const rawActions = buildSuggestedActions(ctx, analysis);
      const actions = filterPhotoConsultProposalChangesBySeam(
        seamForProjectCommit,
        ctx.photo.project_id,
        rawActions,
        Boolean(ctx.task),
      );
      setPhotoAnalysis(analysis);
      setPhotoAnalysisLoading(false);
      setSuggestedActions(actions);
      setSelectedActions(new Set(actions.map((_, index) => index)));
      photoAnalysisTimerRef.current = null;
    }, 2000);
  }, [clearPhotoAnalysisTimer, isGuest, permResult, seamForProjectCommit]);

  useEffect(() => {
    startPhotoConsultRef.current = startPhotoConsult;
  }, [startPhotoConsult]);

  useEffect(() => {
    latestScopedStateRef.current = {
      messages,
      workLogs: Array.from(workLogs.values()),
      proposalQueue,
      pendingGeneralProposalInput,
      inputValue,
      proposalExecutionLinks,
      photoConsult,
      photoAnalysis,
      suggestedActions,
      selectedActions: Array.from(selectedActions),
    };
  }, [
    inputValue,
    messages,
    pendingGeneralProposalInput,
    photoAnalysis,
    photoConsult,
    proposalExecutionLinks,
    proposalQueue,
    selectedActions,
    suggestedActions,
    workLogs,
  ]);

  useEffect(() => {
    const previousScopeKey = previousScopeKeyRef.current;
    if (previousScopeKey !== scopeKey) {
      scopedSidebarStateByKey.set(previousScopeKey, latestScopedStateRef.current);
    }
    previousScopeKeyRef.current = scopeKey;

    clearVoiceTimers();
    clearRegenerateTimers();
    clearPhotoAnalysisTimer();

    const nextState = scopedSidebarStateByKey.get(scopeKey) ?? createEmptyScopedSidebarState();
    setMessages(nextState.messages);
    setWorkLogs(new Map(nextState.workLogs.map((entry) => [entry.id, entry])));
    setProposalQueue(nextState.proposalQueue);
    setPendingGeneralProposalInput(nextState.pendingGeneralProposalInput);
    setInputValue(nextState.inputValue);
    setVoiceState("idle");
    setRegeneratingMessageId(null);
    if (scopeKey === "home") {
      setHomeProjectMode(GENERAL_MODE_VALUE);
    }
    setProposalExecutionLinks(nextState.proposalExecutionLinks);
    setPhotoConsult(nextState.photoConsult);
    setPhotoAnalysis(nextState.photoAnalysis);
    setPhotoAnalysisLoading(false);
    setSuggestedActions(nextState.suggestedActions);
    setSelectedActions(new Set(nextState.selectedActions));

    const scopedPhotoConsult = projectId ? getPhotoConsultContext(projectId) : null;
    if (!nextState.photoConsult && scopedPhotoConsult) {
      startPhotoConsultRef.current?.(scopedPhotoConsult);
    }
  }, [
    clearPhotoAnalysisTimer,
    clearRegenerateTimers,
    clearVoiceTimers,
    projectId,
    scopeKey,
  ]);

  useEffect(() => {
    if (isGuest) return;
    if (!isPersistableAiProjectId(resolvedPermissionProjectId)) {
      setChatArchives([]);
      return;
    }
    const loaded = loadProjectTranscript(resolvedPermissionProjectId);
    if (loaded && loaded.messages.length > 0) {
      setMessages(loaded.messages);
    }
    setChatArchives(loadProjectChatArchives(resolvedPermissionProjectId));
    setExpandedArchiveChatId(null);
  }, [resolvedPermissionProjectId, isGuest]);

  useEffect(() => {
    if (isGuest || !isPersistableAiProjectId(resolvedPermissionProjectId)) return;
    const chatId = getOrCreateProjectChatSessionId(resolvedPermissionProjectId);
    saveProjectTranscript(resolvedPermissionProjectId, { messages, activeChatId: chatId });
  }, [messages, resolvedPermissionProjectId, isGuest]);

  useEffect(() => () => {
    scopedSidebarStateByKey.set(previousScopeKeyRef.current, latestScopedStateRef.current);
  }, []);

  useEffect(() => {
    return subscribePhotoConsult(({ projectId: consultProjectId, context }) => {
      if (!projectId || consultProjectId !== projectId) return;
      if (context) {
        startPhotoConsult(context);
        return;
      }

      clearPhotoAnalysisTimer();
      setPhotoConsult(null);
      setPhotoAnalysis(null);
      setPhotoAnalysisLoading(false);
      setSuggestedActions([]);
      setSelectedActions(new Set());
    });
  }, [clearPhotoAnalysisTimer, projectId, startPhotoConsult]);

  // Activity events
  const allEvents = useEvents(projectId || "");
  const events = useMemo(() => (isProjectContext ? allEvents : []), [isProjectContext, allEvents]);
  const effectiveAutomationMode = useMemo<AutomationMode>(() => {
    const projectMode = isProjectContext ? normalizeAutomationMode(project?.automation_level) : null;
    if (projectMode) return projectMode;
    const profileMode = normalizeAutomationMode(getProfileAutomationLevelMode());
    return profileMode ?? "manual";
  }, [isProjectContext, project?.automation_level]);

  useEffect(() => {
    setAutomationMode(effectiveAutomationMode);
  }, [effectiveAutomationMode]);

  useEffect(() => {
    initializedEventsRef.current = false;
    knownEventIdsRef.current = new Set();
    setHighlightedEventIds(new Set());
    setExpandedProposalEventIds(new Set());
    setExpandedStockUsedEventIds(new Set());
    setExpandedDayKeys(new Set());
  }, [projectId, isProjectContext]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  useEffect(() => {
    return () => {
      clearVoiceTimers();
      clearRegenerateTimers();
      clearPhotoAnalysisTimer();
    };
  }, [clearPhotoAnalysisTimer, clearRegenerateTimers, clearVoiceTimers]);

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
  const activeWorkLogs = useMemo(() => Array.from(workLogs.values()), [workLogs]);
  const latestWorkLog = activeWorkLogs[activeWorkLogs.length - 1];
  const activeQueueItem = proposalQueue ? proposalQueue.items[proposalQueue.activeIndex] : null;
  const hasPhotoConsultActionWindow = Boolean(photoConsult) && suggestedActions.length > 0 && !photoAnalysisLoading;
  const activeWindow: ActiveWindow = latestWorkLog
    ? "worklog"
    : proposalQueue?.phase === "review"
      ? "proposal_queue"
      : proposalQueue?.phase === "executing"
        ? "worklog"
        : proposalQueue?.phase === "revising"
          ? "worklog"
        : hasPhotoConsultActionWindow
          ? "photo_consult"
          : "none";
  const showPhotoConsultCard = Boolean(photoConsult) && activeWindow !== "worklog" && activeWindow !== "proposal_queue";
  const isInputLocked = activeWindow !== "none";
  const showNearLimitIndicator = events.length >= 100;
  const automationLevel = AUTOMATION_MODE_TO_LEVEL[automationMode];
  const allowDirectEdit = automationLevel >= 3;
  const defaultDirectEditForNewProposal = automationLevel === 4;
  const selectedAutomationOption = AUTOMATION_OPTIONS.find((option) => option.mode === automationMode) ?? AUTOMATION_OPTIONS[1];

  const resizeComposer = useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    if (isInputLocked) return;
    resizeComposer();
  }, [inputValue, isInputLocked, resizeComposer]);

  function persistAutomationMode(nextMode: AutomationMode) {
    setAutomationMode(nextMode);
    if (isProjectContext && projectId) {
      updateProject(projectId, { automation_level: nextMode });
      return;
    }
    setProfileAutomationLevelMode(nextMode);
  }

  function emitProposalDeclinedEvent(proposal: AIProposal, payload: Record<string, unknown> = {}) {
    if (!isProjectContext) return;
    addEvent({
      id: `evt-proposal-cancelled-${Date.now()}`,
      project_id: projectId,
      actor_id: user.id,
      type: "proposal_cancelled",
      object_type: "proposal",
      object_id: proposal.id,
      timestamp: new Date().toISOString(),
      payload: {
        summary: proposal.summary,
        status: "cancelled",
        ...payload,
      },
    });
  }

  const runQueueExecution = useCallback(async (queueSnapshot: ProposalQueueState) => {
    const confirmedItems = queueSnapshot.items.filter((item) => item.decision === "confirmed");
    if (confirmedItems.length === 0) {
      setProposalQueue(null);
      executingQueueRef.current = false;
      return;
    }

    setProposalQueue((prev) => (prev
      ? {
          ...prev,
          phase: "executing",
          executionCursor: 0,
          retryByItemId: {},
          executionErrorByItemId: {},
        }
      : prev));

    for (let cursor = 0; cursor < confirmedItems.length; cursor++) {
      const queueItem = confirmedItems[cursor];

      setProposalQueue((prev) => (prev
        ? {
            ...prev,
            phase: "executing",
            executionCursor: cursor,
          }
        : prev));

      let attempt = 0;
      let success = false;
      let lastError = "Execution failed";

      while (attempt < 5 && !success) {
        if (workspaceMode.kind === "supabase" && queueItem.proposal.type === "generate_document") {
          lastError = "AI document generation is unavailable in Supabase mode until document text persistence is supported.";
          setProposalQueue((prev) => (prev
            ? {
                ...prev,
                retryByItemId: { ...prev.retryByItemId, [queueItem.id]: 1 },
                executionErrorByItemId: {
                  ...prev.executionErrorByItemId,
                  [queueItem.id]: lastError,
                },
              }
            : prev));
          toast({
            title: "Unavailable in Supabase mode",
            description: lastError,
            variant: "destructive",
          });
          break;
        }

        attempt += 1;
        const workLogId = `wl-execute-${queueItem.id}-${attempt}-${Date.now()}`;
        setWorkLogs(new Map([
          [workLogId, { id: workLogId, steps: WORK_STEPS_COMMIT, phase: "commit" }],
        ]));

        await wait(WORK_STEPS_COMMIT.length * 600 + 200);

        const shouldSimulateFailure = Math.random() < 0.15;
        const result = shouldSimulateFailure
          ? { success: false as const, error: "Temporary execution error. Retrying..." }
          : commitProposal(queueItem.proposal, {
              eventSource: "ai",
              eventActorId: "ai",
              emitProposalEvent: true,
              authoritySeam: seamForProjectCommit,
            });

        if (result.success) {
          success = true;
          const proposalEventId = result.eventIds.find((eventId) => eventId.startsWith("evt-proposal-"));
          if (proposalEventId) {
            const childEventIds = result.eventIds.filter((eventId) => eventId !== proposalEventId);
            if (childEventIds.length > 0) {
              setProposalExecutionLinks((prev) => ({
                ...prev,
                [proposalEventId]: {
                  summary: queueItem.proposal.summary,
                  proposalId: queueItem.proposal.id,
                  childEventIds,
                },
              }));
            }
          }
          toast({
            title: "Changes applied",
            description: `${queueItem.proposal.summary} completed.`,
          });
          break;
        }

        lastError = result.error ?? "Execution failed";
        setProposalQueue((prev) => (prev
          ? {
              ...prev,
              retryByItemId: { ...prev.retryByItemId, [queueItem.id]: attempt },
              executionErrorByItemId: {
                ...prev.executionErrorByItemId,
                [queueItem.id]: `Attempt ${attempt}/5: ${lastError}`,
              },
            }
          : prev));

        if (attempt < 5) {
          await wait(500);
        }
      }

      setWorkLogs(new Map());

      if (!success) {
        addEvent({
          id: `evt-proposal-failed-${Date.now()}-${cursor}`,
          project_id: projectId,
          actor_id: "ai",
          type: "proposal_cancelled",
          object_type: "proposal",
          object_id: queueItem.proposal.id,
          timestamp: new Date().toISOString(),
          payload: {
            summary: queueItem.proposal.summary,
            status: "failed",
            reason: "execution_failed",
            attempts: 5,
            source: "ai",
          },
        });
        toast({
          title: "Execution failed",
          description: `${queueItem.proposal.summary} failed after 5 retries.`,
          variant: "destructive",
        });
      }
    }

    setWorkLogs(new Map());
    setProposalQueue(null);
    executingQueueRef.current = false;
  }, [projectId, workspaceMode.kind, seamForProjectCommit]);

  const beginQueueExecution = useCallback((queueSnapshot: ProposalQueueState) => {
    if (executingQueueRef.current) return;
    executingQueueRef.current = true;
    void runQueueExecution(queueSnapshot);
  }, [runQueueExecution]);

  /** Latest `runAssistantForContent` for `/home` pending-project flow after `flushSync` (avoids stale seam/context). */
  const runAssistantForContentRef = useRef<
    (
      content: string,
      userMessageId: string,
      targetProjectId?: string,
      responseMode?: AIMessage["mode"],
    ) => void
  >(() => {});

  const runAssistantForContent = useCallback((
    content: string,
    userMessageId: string,
    targetProjectId?: string,
    responseMode: AIMessage["mode"] = "default",
  ) => {
    const workLogId = `wl-${Date.now()}`;
    const hostedLivePath = Boolean(
      targetProjectId &&
        shouldUseHostedLiveTextAssistantPath(workspaceMode.kind, targetProjectId),
    );
    const hostedLiveMode = hostedLivePath
      ? pickInferenceMode(
        content,
        seamForProjectCommit?.membership?.ai_access ?? "none",
      )
      : null;
    const workSteps = hostedLivePath && hostedLiveMode === "consult"
      ? WORK_STEPS_HOSTED_CONSULT
      : WORK_STEPS_GENERATE;
    setWorkLogs((prev) => {
      const next = new Map(prev);
      next.set(workLogId, { id: workLogId, steps: workSteps, phase: "generate" });
      return next;
    });

    const finishWithLegacyHeuristic = () => {
      window.setTimeout(() => {
        if (targetProjectId) {
          const readiness = evaluateProjectTargetedSendReadiness(
            targetProjectId,
            seamForProjectCommit,
            permResult.isLoading,
            ctxProject,
          );
          if (readiness.status === "blocked") {
            setWorkLogs((prev) => {
              const next = new Map(prev);
              next.delete(workLogId);
              return next;
            });
            const denied = liveAssistantPermissionsLine(
              readiness.gate === "loading" ? "loading" : "unavailable",
              profileAssistantLang,
            );
            setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now() + 1}`,
                role: "assistant",
                content: denied,
                timestamp: new Date().toISOString(),
                mode: responseMode,
              },
            ]);
            return;
          }
          if (readiness.status === "no_project") {
            setWorkLogs((prev) => {
              const next = new Map(prev);
              next.delete(workLogId);
              return next;
            });
            setMessages((prev) => [
              ...prev,
              {
                id: `msg-${Date.now() + 1}`,
                role: "assistant",
                content: liveAssistantNoProjectDataLine(profileAssistantLang),
                timestamp: new Date().toISOString(),
                mode: responseMode,
              },
            ]);
            return;
          }
          const contextInputs: AIContextInputs = {
            project: {
              title: ctxProject.title,
              type: ctxProject.type,
              progress_pct: ctxProject.progress_pct,
            },
            stages: ctxStages,
            tasks: ctxTasks,
            financeSummary: ctxFinanceSummary,
            procurementSummary: ctxProcurementSummary,
            events: ctxEventsFull.slice(0, 5),
            memberCount: ctxMembers.length,
            userCredits: user.credits_free + user.credits_paid,
          };
          void buildAIProjectContext(seamForProjectCommit!, contextInputs);
        }

        const proposals = targetProjectId
          ? generateProposalQueue(content, targetProjectId, automationMode, seamForProjectCommit)
          : [];
        const assistantContent = proposals.length > 0
          ? `I've prepared ${proposals.length} proposal${proposals.length === 1 ? "" : "s"}. Review them below.`
          : getTextResponse();

        const assistantMsg: AIMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
          mode: responseMode,
        };

        setWorkLogs((prev) => {
          const next = new Map(prev);
          next.delete(workLogId);
          return next;
        });
        setMessages((prev) => [...prev, assistantMsg]);

        if (proposals.length > 0) {
          const queueItems: ProposalQueueItemState[] = proposals.map((proposal, idx) => ({
            id: `queue-item-${userMessageId}-${idx}`,
            proposal,
            decision: "unresolved",
            suggestEditMode: false,
            suggestEditText: "",
            directEditMode: defaultDirectEditForNewProposal,
            draftSummary: proposal.summary,
            draftChangeLabels: proposal.changes.map((change) => change.label),
          }));
          setProposalQueue({
            messageId: userMessageId,
            items: queueItems,
            activeIndex: 0,
            phase: "review",
            executionCursor: 0,
            retryByItemId: {},
            executionErrorByItemId: {},
          });
        }
      }, WORK_STEPS_GENERATE.length * 600 + 200);
    };

    if (
      targetProjectId
      && hostedLivePath
    ) {
      void (async () => {
        const readiness = evaluateProjectTargetedSendReadiness(
          targetProjectId,
          seamForProjectCommit,
          permResult.isLoading,
          ctxProject,
        );
        if (readiness.status === "blocked") {
          setWorkLogs((prev) => {
            const next = new Map(prev);
            next.delete(workLogId);
            return next;
          });
          const denied = liveAssistantPermissionsLine(
            readiness.gate === "loading" ? "loading" : "unavailable",
            profileAssistantLang,
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              role: "assistant",
              content: denied,
              timestamp: new Date().toISOString(),
              mode: responseMode,
            },
          ]);
          return;
        }
        if (readiness.status === "no_project") {
          setWorkLogs((prev) => {
            const next = new Map(prev);
            next.delete(workLogId);
            return next;
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              role: "assistant",
              content: liveAssistantNoProjectDataLine(profileAssistantLang),
              timestamp: new Date().toISOString(),
              mode: responseMode,
            },
          ]);
          return;
        }

        const seam = seamForProjectCommit;
        if (!seam || seam.projectId !== targetProjectId) {
          setWorkLogs((prev) => {
            const next = new Map(prev);
            next.delete(workLogId);
            return next;
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              role: "assistant",
              content: liveAssistantPermissionsLine("unavailable", profileAssistantLang),
              timestamp: new Date().toISOString(),
              mode: responseMode,
            },
          ]);
          return;
        }

        const contextInputs: AIContextInputs = {
          project: {
            title: ctxProject.title,
            type: ctxProject.type,
            progress_pct: ctxProject.progress_pct,
          },
          stages: ctxStages,
          tasks: ctxTasks,
          financeSummary: ctxFinanceSummary,
          procurementSummary: ctxProcurementSummary,
          events: ctxEventsFull.slice(0, 5),
          memberCount: ctxMembers.length,
          userCredits: user.credits_free + user.credits_paid,
        };
        const contextPack = buildAIProjectContext(seam, contextInputs);
        const chatId = getOrCreateProjectChatSessionId(targetProjectId);

        try {
          const result = await invokeLiveTextAssistant({
            projectId: targetProjectId,
            contextPack,
            userMessage: content,
            workspaceKind: workspaceMode.kind,
            aiAccess: seam.membership?.ai_access ?? "none",
            aiOutputLanguage: workspaceProfilePreferences?.aiOutputLanguage,
            chatId,
          });
          setWorkLogs((prev) => {
            const next = new Map(prev);
            next.delete(workLogId);
            return next;
          });
          const assistantMsg: AIMessage = {
            id: `msg-${Date.now() + 1}`,
            role: "assistant",
            content: result.explanation,
            timestamp: new Date().toISOString(),
            mode: responseMode,
            liveTextProjectId: targetProjectId,
            liveTextAssistantV1: {
              version: 1,
              assistantUiLanguage: result.assistantUiLanguage,
              grounding: result.grounding,
              groundingNote: result.groundingNote,
              sources: result.sources,
              workProposal: result.workProposal,
              responseVersion: result.responseVersion,
              groundingKind: result.groundingKind,
              groundingDetails: result.groundingDetails,
              followUps: result.followUps,
              freshnessHint: result.freshnessHint,
            },
          };
          setMessages((prev) => [...prev, assistantMsg]);
          trackEvent("ai_live_text_completed", {
            project_id: targetProjectId,
            surface: "ai",
            grounding: result.grounding,
          });
        } catch (err) {
          setWorkLogs((prev) => {
            const next = new Map(prev);
            next.delete(workLogId);
            return next;
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              role: "assistant",
              content: userVisibleLiveTextAssistantError(
                err,
                resolveAiAssistantUiLanguage(workspaceProfilePreferences?.aiOutputLanguage, content),
              ),
              timestamp: new Date().toISOString(),
              mode: responseMode,
            },
          ]);
        }
      })();
      return;
    }

    finishWithLegacyHeuristic();
  }, [
    automationMode,
    ctxFinanceSummary,
    ctxMembers.length,
    ctxProcurementSummary,
    ctxProject,
    ctxStages,
    ctxTasks,
    ctxEventsFull,
    defaultDirectEditForNewProposal,
    permResult.isLoading,
    seamForProjectCommit,
    user.credits_free,
    user.credits_paid,
    workspaceMode.kind,
  ]);

  useLayoutEffect(() => {
    runAssistantForContentRef.current = runAssistantForContent;
  }, [runAssistantForContent]);

  function shouldAskProjectBeforeProposal(content: string) {
    return ACTIONABLE_PROPOSAL_PATTERN.test(content);
  }

  function handleHomeProjectModeChange(nextProjectMode: string) {
    const pendingContent = pendingGeneralProposalInput;

    const canRunPendingAssistant =
      Boolean(pendingContent) &&
      nextProjectMode !== GENERAL_MODE_VALUE &&
      activeWindow === "none" &&
      !proposalQueue;

    if (canRunPendingAssistant) {
      const selectedProject = projects.find((projectItem) => projectItem.id === nextProjectMode);
      flushSync(() => {
        setHomeProjectMode(nextProjectMode);
      });
      if (selectedProject) {
        setMessages((prev) => [...prev, {
          id: `msg-${Date.now()}-project-selected`,
          role: "assistant",
          content: `Using "${selectedProject.title}". Preparing proposals now.`,
          timestamp: new Date().toISOString(),
        }]);
      }
      setPendingGeneralProposalInput(null);
      runAssistantForContentRef.current(
        pendingContent,
        `pending-${Date.now()}`,
        nextProjectMode,
        learnMode ? "learn" : "default",
      );
      return;
    }

    setHomeProjectMode(nextProjectMode);
    if (!pendingContent || nextProjectMode === GENERAL_MODE_VALUE) return;
    if (activeWindow !== "none" || proposalQueue) return;
  }

  function handleVoiceInput() {
    // TODO: wire this UI stub to real audio capture/transcription when backend wrapper is available.
    clearVoiceTimers();

    if (voiceState !== "idle") {
      setVoiceState("idle");
      return;
    }

    setVoiceState("listening");
    const toProcessing = window.setTimeout(() => {
      setVoiceState("processing");
    }, 1200);
    const toIdle = window.setTimeout(() => {
      setVoiceState("idle");
    }, 2500);
    voiceTimersRef.current = [toProcessing, toIdle];
  }

  function handleSend(text?: string) {
    if (activeWindow !== "none" || proposalQueue) return;
    const content = (text ?? inputValue).trim();
    if (!content) return;
    setInputValue("");

    // Clear photo consult when sending (prompt was used)
    if (photoConsult) {
      closePhotoConsult(photoConsult.photo.project_id);
      setPhotoConsult(null);
    }

    if (totalCredits <= 0) {
      trackEvent("upgrade_prompt_shown", { surface: "ai_sidebar" });
      setLimitModalOpen(true);
      return;
    }

    if (!isGuest && resolvedPermissionProjectId && !permResult.can("ai.generate")) {
      toast({ title: "Access denied", description: "You don't have permission to use AI generation.", variant: "destructive" });
      return;
    }

    if (!isProjectContext && isHomeContext && homeProjectMode === GENERAL_MODE_VALUE && shouldAskProjectBeforeProposal(content)) {
      const userMsg: AIMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        mode: learnMode ? "learn" : "default",
      };
      setMessages((prev) => [...prev, userMsg, {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content: "This request needs project context. Select a project below, and I will prepare proposals.",
        timestamp: new Date().toISOString(),
      }]);
      setPendingGeneralProposalInput(content);
      return;
    }

    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      mode: learnMode ? "learn" : "default",
    };
    setMessages((prev) => [...prev, userMsg]);

    const targetProjectId = isProjectContext
      ? projectId
      : (isHomeContext && homeProjectMode !== GENERAL_MODE_VALUE ? homeProjectMode : "");

    trackEvent("ai_prompt_submitted", {
      project_id: targetProjectId,
      surface: "ai",
      prompt_length: content.length,
      has_attachments: !!photoConsult,
    });

    runAssistantForContent(content, userMsg.id, targetProjectId || undefined, userMsg.mode);
  }

  function updateQueueDecision(decision: ProposalDecision) {
    let nextQueueSnapshot: ProposalQueueState | null = null;
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const current = prev.items[prev.activeIndex];
      if (!current) return prev;

      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex
          ? { ...item, decision, suggestEditMode: false, suggestEditText: "" }
          : item
      ));
      const nextIndex = prev.activeIndex < nextItems.length - 1 ? prev.activeIndex + 1 : prev.activeIndex;
      const nextQueue = { ...prev, items: nextItems, activeIndex: nextIndex };
      if (decision === "confirmed") {
        trackEvent("ai_proposal_applied", {
          project_id: projectId,
          surface: "ai",
          proposal_id: current.proposal.id,
          proposal_type: current.proposal.type,
        });
      } else if (decision === "declined") {
        trackEvent("ai_proposal_rejected", {
          project_id: projectId,
          surface: "ai",
          proposal_id: current.proposal.id,
          reason: "", // or from some state
        });
      }
      if (nextQueue.items.every((item) => item.decision !== "unresolved")) {
        nextQueueSnapshot = nextQueue;
      }
      return nextQueue;
    });
    if (nextQueueSnapshot) {
      beginQueueExecution(nextQueueSnapshot);
    }
  }

  function handleQueueConfirm() {
    updateQueueDecision("confirmed");
  }

  function handleQueueDecline() {
    if (activeQueueItem) {
      emitProposalDeclinedEvent(activeQueueItem.proposal);
    }
    updateQueueDecision("declined");
  }

  function handleQueueBack() {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      return { ...prev, activeIndex: Math.max(0, prev.activeIndex - 1) };
    });
  }

  function handleQueueNext() {
    let nextQueueSnapshot: ProposalQueueState | null = null;
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const current = prev.items[prev.activeIndex];
      if (!current || current.decision === "unresolved") return prev;
      if (prev.activeIndex < prev.items.length - 1) {
        return { ...prev, activeIndex: prev.activeIndex + 1 };
      }
      if (prev.items.every((item) => item.decision !== "unresolved")) {
        nextQueueSnapshot = prev;
      }
      return prev;
    });
    if (nextQueueSnapshot) {
      beginQueueExecution(nextQueueSnapshot);
    }
  }

  function handleQueueOpenSuggestEdits() {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex
          ? { ...item, suggestEditMode: true, directEditMode: false }
          : item
      ));
      return { ...prev, items: nextItems };
    });
  }

  function handleQueueSuggestEditTextChange(value: string) {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex ? { ...item, suggestEditText: value } : item
      ));
      return { ...prev, items: nextItems };
    });
  }

  function handleQueueCancelSuggestEdits() {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex ? { ...item, suggestEditMode: false } : item
      ));
      return { ...prev, items: nextItems };
    });
  }

  function handleQueueSubmitEdits() {
    if (!proposalQueue || proposalQueue.phase !== "review") return;
    const queueItem = proposalQueue.items[proposalQueue.activeIndex];
    if (!queueItem || !queueItem.suggestEditText.trim()) return;

    const editPrompt = queueItem.suggestEditText.trim();
    const workLogId = `wl-revise-${Date.now()}`;

    setProposalQueue((prev) => (prev ? { ...prev, phase: "revising" } : prev));
    setWorkLogs(new Map([
      [workLogId, { id: workLogId, steps: WORK_STEPS_GENERATE, phase: "generate" }],
    ]));

    setTimeout(() => {
      setProposalQueue((prev) => {
        if (!prev) return prev;
        const current = prev.items[prev.activeIndex];
        if (!current) return { ...prev, phase: "review" };
        const revised = reviseProposalWithEdits(current.proposal, editPrompt);
        const nextItems = prev.items.map((item, idx) => (
          idx === prev.activeIndex
            ? {
                ...item,
                proposal: revised,
                decision: "unresolved" as ProposalDecision,
                suggestEditMode: false,
                suggestEditText: "",
                directEditMode: defaultDirectEditForNewProposal,
                draftSummary: revised.summary,
                draftChangeLabels: revised.changes.map((change) => change.label),
              }
            : item
        ));
        return { ...prev, phase: "review", items: nextItems };
      });
      setWorkLogs(new Map());
    }, WORK_STEPS_GENERATE.length * 600 + 200);
  }

  function handleToggleDirectEdit() {
    if (!allowDirectEdit) return;
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex ? { ...item, directEditMode: !item.directEditMode, suggestEditMode: false } : item
      ));
      return { ...prev, items: nextItems };
    });
  }

  function handleDraftSummaryChange(value: string) {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => (
        idx === prev.activeIndex ? { ...item, draftSummary: value } : item
      ));
      return { ...prev, items: nextItems };
    });
  }

  function handleDraftChangeLabelChange(changeIdx: number, value: string) {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => {
        if (idx !== prev.activeIndex) return item;
        const nextLabels = [...item.draftChangeLabels];
        nextLabels[changeIdx] = value;
        return { ...item, draftChangeLabels: nextLabels };
      });
      return { ...prev, items: nextItems };
    });
  }

  function handleSaveDirectEdits() {
    setProposalQueue((prev) => {
      if (!prev || prev.phase !== "review") return prev;
      const nextItems = prev.items.map((item, idx) => {
        if (idx !== prev.activeIndex) return item;
        const nextChanges = item.proposal.changes.map((change, changeIdx) => ({
          ...change,
          label: item.draftChangeLabels[changeIdx] ?? change.label,
        }));
        return {
          ...item,
          proposal: {
            ...item.proposal,
            summary: item.draftSummary,
            changes: nextChanges,
            status: "pending" as const,
          },
          directEditMode: false,
        };
      });
      return { ...prev, items: nextItems };
    });
  }

  // Photo consult: confirm suggested actions (seam-aware; same enforcement stack as proposal commit)
  function handleConsultConfirm() {
    if (!photoConsult) return;
    if (!seamForProjectCommit) {
      toast({
        title: "Access denied",
        description: "Project permissions are still loading or unavailable.",
        variant: "destructive",
      });
      return;
    }
    if (!isGuest && !permResult.can("ai.generate")) {
      toast({
        title: "Access denied",
        description: "You don't have permission to use AI generation.",
        variant: "destructive",
      });
      return;
    }

    const stages = getStages(photoConsult.photo.project_id);
    const stage = stages[0];
    const actions: PhotoConsultApplyAction[] = [];

    selectedActions.forEach((idx) => {
      const action = suggestedActions[idx];
      if (!action) return;

      if (action.entity_type === "task" && action.action === "create") {
        actions.push({
          kind: "create_task",
          projectId: photoConsult.photo.project_id,
          title: action.label,
          description: `AI-identified issue from photo: ${photoConsult.photo.caption}`,
          stageId: photoConsult.task?.stage_id ?? stage?.id ?? "",
          photoIds: [photoConsult.photo.id],
        });
      }

      if (action.entity_type === "comment" && action.action === "create" && photoConsult.task) {
        actions.push({
          kind: "task_comment",
          projectId: photoConsult.photo.project_id,
          taskId: photoConsult.task.id,
          commentText: `AI Photo Analysis: ${photoAnalysis?.observations ?? "Analysis complete"}`,
        });
      }

      if (action.entity_type === "task" && action.action === "update" && photoConsult.task) {
        actions.push({
          kind: "task_status_done",
          projectId: photoConsult.photo.project_id,
          taskId: photoConsult.task.id,
        });
      }
    });

    const result = commitPhotoConsultActions(actions, {
      authoritySeam: seamForProjectCommit,
      eventSource: "ai",
      eventActorId: "ai",
    });

    if (result.success) {
      toast({
        title: "Changes applied",
        description: `${result.count} action${result.count !== 1 ? "s" : ""} committed.`,
      });
      closePhotoConsult(photoConsult.photo.project_id);
    } else {
      toast({
        title: "Could not apply",
        description: result.error ?? "Permission or validation failed.",
        variant: "destructive",
      });
    }
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

  const suggestions = (isProjectContext || (isHomeContext && homeProjectMode !== GENERAL_MODE_VALUE))
    ? PROJECT_SUGGESTIONS
    : GLOBAL_SUGGESTIONS;
  const panelWidth = collapsed ? COLLAPSED_WIDTH : (isMobile ? "100%" : width);

  const appendToInput = (value: string) => {
    setInputValue((prev) => (prev.trim() ? `${prev} ${value}` : value));
  };

  const participantNames = useMemo(() => (
    members
      .map((member) => getUserById(member.user_id)?.name)
      .filter((name): name is string => Boolean(name))
  ), [members]);

  const filteredEvents = useMemo(() => {
    if (activityFilter === "learn" || activityFilter === "chats") return [] as Event[];
    if (activityFilter === "all") return events;
    if (activityFilter === "ai_actions") return events.filter((event) => isAIEvent(event));
    return events.filter((event) => event.type.startsWith(activityFilter));
  }, [activityFilter, events]);

  const chronologicalFilteredEvents = useMemo(() => (
    [...filteredEvents]
      .map((event, idx) => ({ event, idx }))
      .sort((a, b) => {
        const tsDiff = getEventGroupTimestampMs(a.event) - getEventGroupTimestampMs(b.event);
        if (tsDiff !== 0) return tsDiff;
        return a.idx - b.idx;
      })
      .map((item) => item.event)
  ), [filteredEvents]);

  const eventById = useMemo(() => {
    const map = new Map<string, Event>();
    events.forEach((event) => {
      map.set(event.id, event);
    });
    return map;
  }, [events]);

  const learnMessageIds = useMemo(() => collectLearnRelatedMessageIds(messages), [messages]);
  const learnMessages = useMemo(
    () => messages.filter((message) => learnMessageIds.has(message.id)),
    [messages, learnMessageIds],
  );

  const activeThreadMessages = useMemo(
    () => selectMessagesForActivityFilter(activityFilter, messages, learnMessages),
    [activityFilter, messages, learnMessages],
  );

  const streamRows = useMemo<StreamRow[]>(() => {
    const visibleEventIds = new Set(chronologicalFilteredEvents.map((event) => event.id));
    const groupedChildIds = new Set<string>();
    Object.entries(proposalExecutionLinks).forEach(([proposalEventId, link]) => {
      if (!visibleEventIds.has(proposalEventId)) return;
      const proposalEvent = eventById.get(proposalEventId);
      if (!proposalEvent || proposalEvent.type !== "proposal_confirmed") return;
      const childIds = link.childEventIds.filter((childId) => Boolean(eventById.get(childId)));
      if (childIds.length === 0) return;
      childIds.forEach((childId) => groupedChildIds.add(childId));
    });

    const rows: StreamRow[] = [];
    chronologicalFilteredEvents.forEach((event) => {
      const timestampMs = getEventGroupTimestampMs(event);
      const timestampIso = new Date(timestampMs).toISOString();
      const payload = event.payload as Record<string, unknown>;

      if (event.type === "proposal_confirmed") {
        const link = proposalExecutionLinks[event.id];
        if (!link || link.childEventIds.length === 0) return;
        const childEvents = link.childEventIds
          .map((childId) => eventById.get(childId))
          .filter((candidate): candidate is Event => Boolean(candidate));
        if (childEvents.length === 0) return;

        rows.push({
          id: `proposal-group-${event.id}`,
          kind: "proposal_group",
          tier: 1,
          timestamp: timestampIso,
          timestampMs,
          proposalEvent: event,
          summary: (typeof payload.summary === "string" && payload.summary)
            || link.summary
            || "Execution completed",
          summaryLines: buildProposalSummaryLines(childEvents),
          childEvents,
        });
        return;
      }

      if (groupedChildIds.has(event.id)) {
        return;
      }

      if (event.type === "proposal_cancelled") {
        const status = typeof payload.status === "string" ? payload.status : "cancelled";
        const summary = typeof payload.summary === "string" ? payload.summary : "Proposal";
        const reason = typeof payload.reason === "string" ? payload.reason.replace(/_/g, " ") : "";
        const title = status === "failed" ? "AI proposal failed" : "AI proposal declined";
        const detail = reason ? `${summary} · ${reason}` : summary;
        rows.push({
          id: `status-${event.id}`,
          kind: "status",
          tier: 3,
          timestamp: timestampIso,
          timestampMs,
          title,
          detail,
        });
        return;
      }

      if (event.type === "procurement_updated" && payload.sidebarKind === "stock_used") {
        const details = (payload.details && typeof payload.details === "object")
          ? payload.details as Record<string, unknown>
          : {};
        const detailLines = [
          typeof details.usedBy === "string" && details.usedBy.trim() ? `Used by: ${details.usedBy}` : "",
          typeof details.note === "string" && details.note.trim() ? `Note: ${details.note}` : "",
          typeof details.remainingQty === "number" ? `Remaining qty: ${details.remainingQty}` : "",
        ].filter((line) => line.length > 0);
        rows.push({
          id: `stock-used-${event.id}`,
          kind: "stock_used",
          tier: 1,
          timestamp: timestampIso,
          timestampMs,
          event,
          title: typeof payload.title === "string" && payload.title ? payload.title : "Stock used",
          summary: typeof payload.summary === "string" && payload.summary ? payload.summary : "Stock usage recorded",
          detailLines,
        });
        return;
      }

      rows.push({
        id: `event-${event.id}`,
        kind: "event",
        tier: 2,
        timestamp: timestampIso,
        timestampMs,
        event,
      });
    });

    if (isPersistableAiProjectId(resolvedPermissionProjectId) && chatArchives.length > 0) {
      chatArchives.forEach((entry) => {
        if (!archiveEntryMatchesFeedFilter(entry, activityFilter)) return;
        const timestampMs = entry.endedAt;
        rows.push({
          id: `archived-chat-${entry.chatId}`,
          kind: "archived_chat",
          tier: 2,
          timestamp: new Date(timestampMs).toISOString(),
          timestampMs,
          archiveEntry: entry,
        });
      });
    }

    return rows
      .map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const tsDiff = a.row.timestampMs - b.row.timestampMs;
        if (tsDiff !== 0) return tsDiff;
        return a.idx - b.idx;
      })
      .map((item) => item.row);
  }, [
    activityFilter,
    chatArchives,
    chronologicalFilteredEvents,
    eventById,
    proposalExecutionLinks,
    resolvedPermissionProjectId,
  ]);

  const dayBuckets = useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>();
    streamRows.forEach((row) => {
      const dayKey = getDayKey(row.timestampMs);
      const existing = map.get(dayKey);
      if (existing) {
        existing.rows.push(row);
        return;
      }

      const date = new Date(row.timestampMs);
      map.set(dayKey, {
        key: dayKey,
        label: getDayLabel(row.timestampMs),
        rows: [row],
        olderThanYesterday: !isToday(date) && !isYesterday(date),
      });
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [streamRows]);

  const visibleDayBuckets = useMemo(() => {
    if (dayBuckets.length === 0) return [];
    const n = Math.min(visibleDayBucketCount, dayBuckets.length);
    return dayBuckets.slice(-n);
  }, [dayBuckets, visibleDayBucketCount]);

  const hasMoreOlderDayBuckets = dayBuckets.length > visibleDayBucketCount;

  useEffect(() => {
    setVisibleDayBucketCount(INITIAL_VISIBLE_DAY_BUCKETS);
  }, [scopeKey]);

  const latestRenderedRowId = useMemo(() => {
    const lastFeed = streamRows[streamRows.length - 1];
    const lastActive = activeThreadMessages[activeThreadMessages.length - 1];
    if (!lastActive && !lastFeed) return null;
    if (!lastActive) return lastFeed!.id;
    if (!lastFeed) return `active-${lastActive.id}`;
    return toTimestampMs(lastActive.timestamp) >= lastFeed.timestampMs
      ? `active-${lastActive.id}`
      : lastFeed.id;
  }, [streamRows, activeThreadMessages]);
  const activeExecutionItem = useMemo(() => {
    if (!proposalQueue || proposalQueue.phase !== "executing") return null;
    const confirmed = proposalQueue.items.filter((item) => item.decision === "confirmed");
    return confirmed[proposalQueue.executionCursor] ?? null;
  }, [proposalQueue]);

  const getFeedViewport = useCallback(() => {
    return scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement | null;
  }, []);

  useEffect(() => {
    const viewport = getFeedViewport();
    if (!viewport) return;

    const handleScroll = () => {
      const distanceToBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isNearBottomRef.current = distanceToBottom < 56;
    };

    handleScroll();
    viewport.addEventListener("scroll", handleScroll);
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [getFeedViewport]);

  useEffect(() => {
    const viewport = getFeedViewport();
    if (!viewport) return;
    if (!latestRenderedRowId) return;

    const hasNewEvent = latestEventIdRef.current !== latestRenderedRowId;
    if (hasNewEvent && isNearBottomRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    latestEventIdRef.current = latestRenderedRowId;
  }, [getFeedViewport, latestRenderedRowId]);

  useEffect(() => {
    setExpandedDayKeys((prev) => {
      const next = new Set<string>();
      dayBuckets.forEach((bucket) => {
        if (!bucket.olderThanYesterday || prev.has(bucket.key)) {
          next.add(bucket.key);
        }
      });
      return next;
    });
  }, [dayBuckets]);

  useEffect(() => {
    if (!isProjectContext) {
      initializedEventsRef.current = false;
      knownEventIdsRef.current = new Set();
      return;
    }

    const currentIds = new Set(events.map((event) => event.id));
    if (!initializedEventsRef.current) {
      knownEventIdsRef.current = currentIds;
      initializedEventsRef.current = true;
      return;
    }

    const newIds = events
      .map((event) => event.id)
      .filter((eventId) => !knownEventIdsRef.current.has(eventId));

    if (newIds.length > 0) {
      setHighlightedEventIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });

      newIds.forEach((id) => {
        const timer = window.setTimeout(() => {
          setHighlightedEventIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          highlightTimersRef.current.delete(id);
        }, 2500);
        highlightTimersRef.current.set(id, timer);
      });
    }

    knownEventIdsRef.current = currentIds;
  }, [events, isProjectContext]);

  useEffect(() => {
    const timers = highlightTimersRef.current;
    return () => {
      timers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      timers.clear();
    };
  }, []);

  const filterOptions: { key: FeedFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "chats", label: "Chats" },
    { key: "learn", label: "Learn" },
    { key: "task", label: "Task" },
    { key: "estimate", label: "Estimate" },
    { key: "document", label: "Document" },
    { key: "photo", label: "Photo" },
    { key: "member", label: "Member" },
    { key: "ai_actions", label: "AI actions" },
  ];

  const toggleProposalGroup = (proposalEventId: string) => {
    setExpandedProposalEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(proposalEventId)) next.delete(proposalEventId);
      else next.add(proposalEventId);
      return next;
    });
  };

  const toggleStockUsedGroup = (eventId: string) => {
    setExpandedStockUsedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const toggleDayBucket = (dayKey: string) => {
    setExpandedDayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  const handleToggleLearnMode = () => {
    setLearnMode((prev) => !prev);
  };

  const handleNewConversation = useCallback(() => {
    if (isGuest || !isPersistableAiProjectId(resolvedPermissionProjectId)) return;
    const endingChatId = getOrCreateProjectChatSessionId(resolvedPermissionProjectId);
    if (messages.length > 0 && endingChatId) {
      prependProjectChatArchive(resolvedPermissionProjectId, {
        chatId: endingChatId,
        endedAt: Date.now(),
        previewLines: buildArchivePreviewLines(messages),
        messagesSnapshot: trimMessagesForArchive(messages),
        feedHints: {
          aiActions: transcriptHasAiActionSignals(messages),
        },
      });
    }
    clearProjectTranscript(resolvedPermissionProjectId);
    rotateProjectChatSessionId(resolvedPermissionProjectId);
    setMessages([]);
    setChatArchives(loadProjectChatArchives(resolvedPermissionProjectId));
    setExpandedArchiveChatId(null);
    setPlusMenuOpen(false);
  }, [isGuest, resolvedPermissionProjectId, messages]);

  const handleAttachFilePhoto = () => {
    toast({ title: "Attach file/photo", description: "UI stub for attachment flow." });
    setPlusMenuOpen(false);
  };

  const handleTagPerson = () => {
    if (participantNames.length === 0) {
      appendToInput("@participant");
      toast({ title: "No participants found", description: "TODO: connect participants selector." });
      setPlusMenuOpen(false);
      return;
    }
    const picked = participantNames[tagPersonCursor % participantNames.length];
    setTagPersonCursor((prev) => prev + 1);
    appendToInput(`@${picked}`);
    setPlusMenuOpen(false);
  };

  const handleReferenceTask = () => {
    if (tasks.length === 0) {
      appendToInput("#item");
      toast({ title: "No tasks available", description: "TODO: connect task/item selector." });
      setPlusMenuOpen(false);
      return;
    }
    const picked = tasks[referenceTaskCursor % tasks.length];
    setReferenceTaskCursor((prev) => prev + 1);
    appendToInput(`#${picked.title}`);
    setPlusMenuOpen(false);
  };

  function resolveActiveProjectForLearnDocument() {
    if (isProjectContext) return projectId;
    if (isHomeContext && homeProjectMode !== GENERAL_MODE_VALUE) return homeProjectMode;
    return "";
  }

  async function handleCopyLearnMessage(message: AIMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({ title: "Copied", description: "AI message copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Clipboard is unavailable.", variant: "destructive" });
    }
  }

  function handleRateLearnMessage(messageId: string, rating: "good" | "bad") {
    setMessageRatings((prev) => {
      const current = prev[messageId];
      const next: Record<string, "good" | "bad" | undefined> = { ...prev };
      next[messageId] = current === rating ? undefined : rating;
      return next;
    });
  }

  function handleSaveLearnMessage(message: AIMessage) {
    if (savedMessageIds.has(message.id)) {
      toast({ title: "Already saved", description: "This answer is already in Documents." });
      return;
    }

    if (workspaceMode.kind === "supabase") {
      toast({
        title: "Unavailable in Supabase mode",
        description: "Learn-note saves need full document text persistence, which is not available yet in Supabase mode.",
        variant: "destructive",
      });
      return;
    }

    const targetProjectId = resolveActiveProjectForLearnDocument();
    if (!targetProjectId) {
      toast({
        title: "Select a project",
        description: "Choose a project before saving Learn notes.",
        variant: "destructive",
      });
      return;
    }

    const marker = `<!-- learn-msg:${message.id} -->`;
    const timestampHeader = format(new Date(), "MMM d, yyyy HH:mm");
    const entry = `${marker}\n## ${timestampHeader}\n\n${message.content}`;
    const docs = getDocuments(targetProjectId);
    const learnDoc = docs.find((doc) => doc.title === "Learn notes");
    const existingDocWithMarker = docs.find((doc) => doc.versions.some((version) => version.content.includes(marker)));
    if (existingDocWithMarker) {
      setSavedMessageIds((prev) => {
        const next = new Set(prev);
        next.add(message.id);
        return next;
      });
      toast({ title: "Already saved", description: "This answer is already in Documents." });
      return;
    }

    if (!learnDoc) {
      const docId = `doc-learn-${Date.now()}`;
      const versionId = `dv-learn-${Date.now()}`;
      addDocument({
        id: docId,
        project_id: targetProjectId,
        type: "report",
        title: "Learn notes",
        origin: "ai_generated",
        versions: [{
          id: versionId,
          document_id: docId,
          number: 1,
          status: "draft",
          content: `# Learn notes\n\n${entry}`,
        }],
      });
      addEvent({
        id: `evt-learn-doc-${Date.now()}`,
        project_id: targetProjectId,
        actor_id: user.id,
        type: "document_created",
        object_type: "document",
        object_id: docId,
        timestamp: new Date().toISOString(),
        payload: { title: "Learn notes", source: "learn" },
      });
    } else {
      const latest = learnDoc.versions[learnDoc.versions.length - 1];
      const nextVersionNumber = learnDoc.versions.length + 1;
      addDocumentVersion(learnDoc.id, {
        id: `dv-learn-${Date.now()}`,
        document_id: learnDoc.id,
        number: nextVersionNumber,
        status: "draft",
        content: `${latest?.content ?? ""}\n\n${entry}`.trim(),
      });
      addEvent({
        id: `evt-learn-docv-${Date.now()}`,
        project_id: targetProjectId,
        actor_id: user.id,
        type: "document_version_created",
        object_type: "document",
        object_id: learnDoc.id,
        timestamp: new Date().toISOString(),
        payload: { title: "Learn notes", version: nextVersionNumber, source: "learn" },
      });
    }

    setSavedMessageIds((prev) => {
      const next = new Set(prev);
      next.add(message.id);
      return next;
    });
    toast({ title: "Saved to Documents", description: "Learn notes updated." });
  }

  function handleRegenerateLearnMessage(message: AIMessage) {
    if (activeWindow !== "none" || proposalQueue) {
      toast({ title: "AI is busy", description: "Finish the current action before regenerating.", variant: "destructive" });
      return;
    }

    const messageIndex = messages.findIndex((item) => item.id === message.id);
    if (messageIndex < 0) return;

    let sourceUserMessage: AIMessage | undefined;
    for (let idx = messageIndex - 1; idx >= 0; idx -= 1) {
      if (messages[idx]?.role === "user") {
        sourceUserMessage = messages[idx];
        break;
      }
    }
    if (!sourceUserMessage) {
      toast({ title: "Nothing to regenerate", description: "No user prompt found for this answer.", variant: "destructive" });
      return;
    }

    setRegeneratingMessageId(message.id);
    const targetProjectId = isProjectContext
      ? projectId
      : (isHomeContext && homeProjectMode !== GENERAL_MODE_VALUE ? homeProjectMode : "");
    runAssistantForContent(
      sourceUserMessage.content,
      sourceUserMessage.id,
      targetProjectId || undefined,
      sourceUserMessage.mode ?? "default",
    );

    const timerId = window.setTimeout(() => {
      setRegeneratingMessageId((current) => (current === message.id ? null : current));
      regenerateTimersRef.current = regenerateTimersRef.current.filter((id) => id !== timerId);
    }, WORK_STEPS_GENERATE.length * 600 + 500);
    regenerateTimersRef.current.push(timerId);
  }

  function renderLiveChatMessage(message: AIMessage) {
    const isLearnMessage = message.mode === "learn";
    const isLearnContext = isLearnMessage
      || learnMode
      || activityFilter === "learn"
      || ((message as AIMessage & { meta?: { mode?: string } }).meta?.mode === "learn");
    const isUserMessage = message.role === "user";
    const rating = messageRatings[message.id];
    const isSaved = savedMessageIds.has(message.id);
    const isRegenerating = regeneratingMessageId === message.id;
    return (
      <div key={`active-chat-${message.id}`} className="px-0 py-1.5 min-w-0 max-w-full">
        <div className={`rounded-md border border-border/60 px-2 py-1.5 min-w-0 max-w-full ${
          isUserMessage ? "bg-sidebar-accent/40" : "bg-muted/20"
        }`}>
          <div className="flex items-center gap-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-muted">
              {isUserMessage
                ? <User className="h-3 w-3 text-muted-foreground" />
                : <Bot className="h-3 w-3 text-accent" />}
            </div>
            <p className="text-caption font-medium text-foreground">
              {isUserMessage ? "You" : "AI"}
            </p>
            {isLearnMessage && (
              <span className="rounded-pill bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                Learn
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 text-caption text-foreground/95 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
            {message.content}
          </p>
          {!isUserMessage && message.liveTextAssistantV1 && message.liveTextProjectId ? (
            <>
              <GroundingCallout
                grounding={message.liveTextAssistantV1.grounding}
                groundingNote={message.liveTextAssistantV1.groundingNote}
                sources={message.liveTextAssistantV1.sources}
                inferenceGroundingKind={message.liveTextAssistantV1.groundingKind}
                groundingDetails={message.liveTextAssistantV1.groundingDetails}
                freshnessHint={message.liveTextAssistantV1.freshnessHint}
                language={message.liveTextAssistantV1.assistantUiLanguage ?? "en"}
              />
              {message.liveTextAssistantV1.followUps
                && message.liveTextAssistantV1.followUps.length > 0 ? (
                <div className="mt-1.5 min-w-0 max-w-full">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">
                    {message.liveTextAssistantV1.assistantUiLanguage === "ru"
                      ? "Предлагаемые уточнения"
                      : "Suggested follow-ups"}
                  </p>
                  <SuggestionChips
                    suggestions={message.liveTextAssistantV1.followUps.map((f) => f.prompt)}
                    onSelect={(text) => setInputValue(text)}
                    singleLineScrollable
                  />
                </div>
              ) : null}
              {message.liveTextAssistantV1.workProposal ? (
                <WorkProposalPreview
                  projectId={message.liveTextProjectId}
                  proposal={message.liveTextAssistantV1.workProposal}
                />
              ) : null}
            </>
          ) : null}
          {!isUserMessage && isLearnContext && (
            <div className="mt-1.5 flex items-center gap-0.5 opacity-70 hover:opacity-100 transition-opacity">
              <button
                type="button"
                title="Copy"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
                onClick={() => { void handleCopyLearnMessage(message); }}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Rate good"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  rating === "good"
                    ? "text-accent bg-accent/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                }`}
                onClick={() => handleRateLearnMessage(message.id, "good")}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Rate bad"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  rating === "bad"
                    ? "text-destructive bg-destructive/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                }`}
                onClick={() => handleRateLearnMessage(message.id, "bad")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Save to Documents"
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  isSaved
                    ? "text-accent bg-accent/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
                }`}
                onClick={() => handleSaveLearnMessage(message)}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={isRegenerating ? "Regenerating..." : "Regenerate"}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors disabled:opacity-60"
                disabled={isRegenerating}
                onClick={() => handleRegenerateLearnMessage(message)}
              >
                {isRegenerating
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              type="button"
              onClick={() => onCollapsedChange(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 transition-colors hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <PanelLeft className="h-4 w-4 text-accent" />
              <span className="sr-only">Open AI sidebar</span>
            </button>
          </div>
        ) : (
          <>
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
                {/* === MAIN BODY === */}
                <div className="flex-1 min-h-0 flex flex-col" style={{ width: "100%" }}>
                  {/* Inline filters */}
                  {isProjectContext && (
                    <div className="px-3 pt-2 shrink-0">
                      <div className="overflow-x-auto overflow-y-hidden no-scrollbar">
                        <div className="flex items-center gap-1 flex-nowrap min-w-max pb-1">
                          {filterOptions.map((filter) => (
                            <button
                              key={filter.key}
                              onClick={() => setActivityFilter(filter.key)}
                              className={`rounded-pill px-2.5 py-0.5 text-caption font-medium transition-colors border shrink-0 ${
                                activityFilter === filter.key
                                  ? "bg-accent/15 text-accent border-accent/20"
                                  : "bg-transparent text-muted-foreground border-border hover:border-accent/20"
                              }`}
                            >
                              {filter.label}
                            </button>
                          ))}
                          {showNearLimitIndicator && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-destructive/40 shrink-0 ml-1"
                                  style={{ background: "conic-gradient(#ef4444 0deg 288deg, rgba(239,68,68,0.2) 288deg 360deg)" }}
                                />
                              </TooltipTrigger>
                              <TooltipContent className="text-caption">
                                Rovno will archive activity soon to clear the space
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Activity feed: day headers stay fixed; only rows + chat scroll */}
                  <div
                    className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col px-3 box-border"
                    style={{ width: "100%" }}
                  >
                    {streamRows.length > 0 ? (
                      <div className="shrink-0 z-20 bg-sidebar border-b border-border/60 px-0 py-2 space-y-1.5">
                        {hasMoreOlderDayBuckets ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-full text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              setVisibleDayBucketCount(
                                (c) => c + LOAD_MORE_DAY_BUCKET_INCREMENT,
                              )}
                          >
                            Load more
                          </Button>
                        ) : null}
                        <div className="space-y-0.5">
                          {visibleDayBuckets.map((bucket) => {
                            const isExpanded = expandedDayKeys.has(bucket.key);
                            return (
                              <button
                                key={bucket.key}
                                type="button"
                                onClick={() => toggleDayBucket(bucket.key)}
                                className="w-full flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/90 hover:text-foreground transition-colors text-left"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                )}
                                <span>{bucket.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <ScrollArea ref={scrollRef} className="flex-1 min-h-0 min-w-0">
                      <div className="space-y-2 py-2 pr-1 min-w-0 max-w-full">
                        {streamRows.length === 0 && activeThreadMessages.length === 0 ? (
                          <p className="text-caption text-muted-foreground text-center py-8">
                            No activity yet
                          </p>
                        ) : (
                          <>
                            {streamRows.length > 0 ? (
                              <div className="space-y-2 min-w-0 max-w-full">
                                {visibleDayBuckets.map((bucket) => {
                              const isExpanded = expandedDayKeys.has(bucket.key);
                              return (
                                <section key={bucket.key} className="space-y-1.5">
                                  {isExpanded && (
                                    <div className="glass rounded-card divide-y divide-border min-w-0 max-w-full overflow-hidden">
                                      {bucket.rows.map((row, rowIndex) => {
                                        if (row.kind === "event") {
                                          return (
                                            <EventFeedItem
                                              key={row.id}
                                              event={row.event}
                                              highlighted={highlightedEventIds.has(row.event.id)}
                                            />
                                          );
                                        }

                                        if (row.kind === "proposal_group") {
                                          const groupExpanded = expandedProposalEventIds.has(row.proposalEvent.id);
                                          const groupHighlighted = highlightedEventIds.has(row.proposalEvent.id);
                                          return (
                                            <div key={row.id} className={`px-2 py-1.5 ${rowIndex > 0 ? "mt-2" : ""}`}>
                                              <button
                                                type="button"
                                                onClick={() => toggleProposalGroup(row.proposalEvent.id)}
                                                className={`w-full flex items-start gap-2 text-left rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 transition-colors ${
                                                  groupHighlighted ? "bg-destructive/15" : "hover:bg-accent/10"
                                                }`}
                                                style={{ transitionDuration: groupHighlighted ? "2500ms" : undefined }}
                                              >
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md mt-0.5 bg-accent/15">
                                                  <Bot className="h-3.5 w-3.5 text-accent" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-body-sm font-semibold leading-tight text-foreground">
                                                    AI proposal executed
                                                  </p>
                                                  <div className="mt-1 space-y-0.5">
                                                    {row.summaryLines.map((line, lineIndex) => (
                                                      <p key={`${row.id}-summary-line-${lineIndex}`} className="text-caption leading-5 text-muted-foreground">
                                                        {line}
                                                      </p>
                                                    ))}
                                                  </div>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
                                                  {new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                                {groupExpanded ? (
                                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                ) : (
                                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                )}
                                              </button>
                                              {groupExpanded && (
                                                <div className="mt-1 ml-3 border-l border-border pl-2 space-y-0.5">
                                                  {row.childEvents.map((childEvent) => (
                                                    <EventFeedItem
                                                      key={`group-child-${row.id}-${childEvent.id}`}
                                                      event={childEvent}
                                                      compact
                                                      highlighted={highlightedEventIds.has(childEvent.id)}
                                                    />
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        }

                                        if (row.kind === "stock_used") {
                                          const expanded = expandedStockUsedEventIds.has(row.event.id);
                                          const highlighted = highlightedEventIds.has(row.event.id);
                                          return (
                                            <div key={row.id} className={`px-2 py-1.5 ${rowIndex > 0 ? "mt-2" : ""}`}>
                                              <button
                                                type="button"
                                                onClick={() => toggleStockUsedGroup(row.event.id)}
                                                className={`w-full flex items-start gap-2 text-left rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 transition-colors ${
                                                  highlighted ? "bg-destructive/15" : "hover:bg-accent/10"
                                                }`}
                                                style={{ transitionDuration: highlighted ? "2500ms" : undefined }}
                                              >
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md mt-0.5 bg-accent/15">
                                                  <Bot className="h-3.5 w-3.5 text-accent" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-body-sm font-semibold leading-tight text-foreground">{row.title}</p>
                                                  <p className="mt-1 text-caption leading-5 text-muted-foreground">{row.summary}</p>
                                                </div>
                                                <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
                                                  {new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                                {expanded ? (
                                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                ) : (
                                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                                )}
                                              </button>
                                              {expanded && row.detailLines.length > 0 && (
                                                <div className="mt-1 ml-3 border-l border-border pl-2 space-y-0.5">
                                                  {row.detailLines.map((line, lineIndex) => (
                                                    <p key={`${row.id}-line-${lineIndex}`} className="text-caption text-muted-foreground">
                                                      {line}
                                                    </p>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        }

                                        if (row.kind === "status") {
                                          return (
                                            <div key={row.id} className="px-2 py-1 text-caption text-muted-foreground">
                                              <div className="flex items-center gap-2">
                                                <p className="truncate">
                                                  {row.detail ? `${row.title}: ${row.detail}` : row.title}
                                                </p>
                                                <span className="ml-auto text-[10px] text-muted-foreground/90 whitespace-nowrap shrink-0">
                                                  {new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        }

                                        if (row.kind === "archived_chat") {
                                          const entry = row.archiveEntry;
                                          const expanded = expandedArchiveChatId === entry.chatId;
                                          return (
                                            <div
                                              key={row.id}
                                              className={`px-2 py-1.5 min-w-0 max-w-full ${rowIndex > 0 ? "mt-2" : ""}`}
                                            >
                                              <div className="glass rounded-lg border border-border/60 px-2 py-1.5 min-w-0 max-w-full">
                                                <div className="flex items-start gap-2 min-w-0">
                                                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                                                    <Bot className="h-3.5 w-3.5 text-accent" />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-caption font-medium text-foreground">
                                                      {format(new Date(entry.endedAt), "MMM d, yyyy · HH:mm")}
                                                    </p>
                                                    {entry.previewLines.map((line, i) => (
                                                      <p
                                                        key={`${entry.chatId}-preview-${i}`}
                                                        className="text-[11px] text-muted-foreground leading-snug line-clamp-2"
                                                      >
                                                        {line}
                                                      </p>
                                                    ))}
                                                  </div>
                                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
                                                    {new Date(row.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                  </span>
                                                </div>
                                                <div className="mt-1.5 flex items-center gap-1.5">
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px] px-2"
                                                    onClick={() => setExpandedArchiveChatId(expanded ? null : entry.chatId)}
                                                  >
                                                    {expanded ? "Hide" : "Open"}
                                                  </Button>
                                                </div>
                                                {expanded && entry.messagesSnapshot.length > 0 && (
                                                  <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2 max-h-[280px] overflow-y-auto">
                                                    {entry.messagesSnapshot.map((m) => (
                                                      <div
                                                        key={`${entry.chatId}-snap-${m.id}`}
                                                        className={`rounded-md border border-border/50 px-2 py-1 ${
                                                          m.role === "user" ? "bg-sidebar-accent/30" : "bg-muted/15"
                                                        }`}
                                                      >
                                                        <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                                                          {m.role === "user" ? "You" : "AI"}
                                                        </p>
                                                        <p className="text-[11px] text-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                                          {m.content}
                                                        </p>
                                                      </div>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        }

                                        {
                                          const _exhaustiveCheck: never = row;
                                          void _exhaustiveCheck;
                                        }
                                        return null;
                                      })}
                                    </div>
                                  )}
                                </section>
                              );
                                })}
                              </div>
                            ) : null}
                            {activeThreadMessages.length > 0 ? (
                              <section
                                className={`space-y-1 min-w-0 max-w-full ${
                                  streamRows.length > 0 ? "pt-3 mt-1 border-t border-border/50" : ""
                                }`}
                              >
                                {activeThreadMessages.map((m) => renderLiveChatMessage(m))}
                              </section>
                            ) : null}
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* === STICKY COMMAND ZONE === */}
                <div className="p-3 space-y-2 shrink-0 box-border border-t border-border min-w-0 max-w-full" style={{ width: "100%" }}>
                  {/* Keep current interactive blocks and animations */}
                  {activeWindow === "worklog" && latestWorkLog && (
                    <div className="w-full min-w-0 space-y-1.5">
                      <WorkLog steps={latestWorkLog.steps} />
                      {proposalQueue?.phase === "executing" && activeExecutionItem && (
                        <div className="glass rounded-card p-2 space-y-1">
                          <p className="text-caption text-foreground font-medium">
                            Executing {proposalQueue.executionCursor + 1}/
                            {proposalQueue.items.filter((item) => item.decision === "confirmed").length}
                          </p>
                          <p className="text-caption text-muted-foreground truncate">
                            {activeExecutionItem.proposal.summary}
                          </p>
                          {proposalQueue.executionErrorByItemId[activeExecutionItem.id] && (
                            <p className="text-caption text-destructive">
                              {proposalQueue.executionErrorByItemId[activeExecutionItem.id]}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeWindow === "proposal_queue" && proposalQueue && activeQueueItem && (
                    <div className="w-full min-w-0">
                      <ProposalQueueCard
                        item={activeQueueItem}
                        index={proposalQueue.activeIndex}
                        total={proposalQueue.items.length}
                        canGoBack={proposalQueue.activeIndex > 0}
                        canGoNext={activeQueueItem.decision !== "unresolved"}
                        allowDirectEdit={allowDirectEdit}
                        isBusy={proposalQueue.phase === "revising"}
                        onConfirm={handleQueueConfirm}
                        onDecline={handleQueueDecline}
                        onOpenSuggestEdits={handleQueueOpenSuggestEdits}
                        onSuggestEditTextChange={handleQueueSuggestEditTextChange}
                        onSubmitEdits={handleQueueSubmitEdits}
                        onCancelSuggestEdits={handleQueueCancelSuggestEdits}
                        onToggleDirectEdit={handleToggleDirectEdit}
                        onDraftSummaryChange={handleDraftSummaryChange}
                        onDraftChangeLabelChange={handleDraftChangeLabelChange}
                        onSaveDirectEdits={handleSaveDirectEdits}
                        onBack={handleQueueBack}
                        onNext={handleQueueNext}
                      />
                    </div>
                  )}

                  {showPhotoConsultCard && photoConsult && (
                    <div className="glass rounded-card p-2.5 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className={`h-10 w-10 rounded-lg shrink-0 ${placeholderColors[0]} flex items-center justify-center`}>
                          <Camera className="h-4 w-4 text-muted-foreground/30" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-sm font-semibold text-foreground truncate">{photoConsult.photo.caption}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(photoConsult.photo.created_at), "MMM d, yyyy · HH:mm")}
                          </p>
                        </div>
                        <button
                          onClick={() => closePhotoConsult(photoConsult.photo.project_id)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {photoAnalysisLoading && (
                        <div className="space-y-2 animate-pulse">
                          <div className="h-3 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-full" />
                        </div>
                      )}

                      {photoAnalysis && !photoAnalysisLoading && (
                        <p className="text-caption text-foreground">{photoAnalysis.observations}</p>
                      )}

                      {suggestedActions.length > 0 && !photoAnalysisLoading && (
                        <div className="space-y-2">
                          <PreviewCard summary="Suggested actions" changes={suggestedActions} />
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
                  )}

                  {!isInputLocked && (
                    <>
                      <SuggestionChips
                        suggestions={suggestions}
                        onSelect={(text) => setInputValue(text)}
                        singleLineScrollable
                      />

                      <div className="flex w-full min-w-0 items-end gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/50 px-2 py-1.5 shadow-sm transition-[box-shadow,border-color] focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/25">
                        <div className="flex shrink-0 items-center gap-1 pb-0.5">
                          <Popover open={plusMenuOpen} onOpenChange={setPlusMenuOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9 shrink-0 rounded-full border-sidebar-border bg-transparent"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-auto p-2">
                              <div className="flex flex-col gap-1.5">
                                {isPersistableAiProjectId(resolvedPermissionProjectId) && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="h-8 px-2 justify-start"
                                    onClick={handleNewConversation}
                                  >
                                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                    New conversation
                                  </Button>
                                )}
                              <div className="flex items-center gap-1.5">
                                <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleAttachFilePhoto}>
                                  <Paperclip className="h-3.5 w-3.5 mr-1" />
                                  Attach
                                </Button>
                                <Button
                                  size="sm"
                                  variant={learnMode ? "default" : "outline"}
                                  className="h-8 px-2"
                                  onClick={handleToggleLearnMode}
                                >
                                  <GraduationCap className="h-3.5 w-3.5 mr-1" />
                                  Learn
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleTagPerson}>
                                  <AtSign className="h-3.5 w-3.5 mr-1" />
                                  Tag
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 px-2" onClick={handleReferenceTask}>
                                  <Link2 className="h-3.5 w-3.5 mr-1" />
                                  Reference
                                </Button>
                              </div>
                              </div>
                            </PopoverContent>
                          </Popover>

                          {MVP_SHOW_AI_AUTOMATION_MODE_UI ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                className="h-9 max-w-[11rem] shrink-0 rounded-full border-sidebar-border bg-transparent px-3 text-caption font-medium"
                              >
                                <span className="truncate">{selectedAutomationOption.label}</span>
                                <ChevronDown className="h-3.5 w-3.5 ml-1.5 shrink-0" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64 p-1">
                              {AUTOMATION_OPTIONS.map((option) => {
                                const isCurrent = option.mode === automationMode;
                                return (
                                  <Tooltip key={`automation-option-${option.mode}`}>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuItem
                                        onSelect={() => persistAutomationMode(option.mode)}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <span className="text-caption text-foreground">{option.label}</span>
                                        {isCurrent && <Check className="h-3.5 w-3.5 text-accent" />}
                                      </DropdownMenuItem>
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="text-caption whitespace-nowrap">
                                      {option.description}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          ) : null}

                          {learnMode && (
                            <span className="group inline-flex h-9 items-center rounded-full border border-sidebar-border bg-transparent px-2.5 text-caption font-medium text-foreground shrink-0">
                              <span className="relative mr-1 inline-flex h-3.5 w-3.5 items-center justify-center">
                                <GraduationCap className="h-3.5 w-3.5 text-accent group-hover:hidden" />
                                <button
                                  type="button"
                                  aria-label="Disable Learn mode"
                                  onClick={handleToggleLearnMode}
                                  className="absolute inset-0 hidden items-center justify-center text-muted-foreground hover:text-foreground group-hover:inline-flex"
                                >
                                  <XIcon className="h-3.5 w-3.5" />
                                </button>
                              </span>
                              Learn
                            </span>
                          )}
                        </div>

                        <Textarea
                          ref={composerTextareaRef}
                          placeholder={
                            learnMode
                              ? "Ask AI to explain decisions and tradeoffs..."
                              : photoConsult
                                ? "Edit prompt or send as-is..."
                                : "Ask AI..."
                          }
                          className="min-h-[38px] max-h-[220px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-body-sm shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
                          value={inputValue}
                          rows={1}
                          onChange={(e) => {
                            setInputValue(e.target.value);
                            resizeComposer();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                        />

                        <div className="flex shrink-0 items-center gap-1.5 pb-0.5">
                          <Button
                            size="icon"
                            variant="outline"
                            className={`h-9 w-9 shrink-0 rounded-full border-sidebar-border bg-transparent ${
                              voiceState === "listening"
                                ? "bg-accent/10 text-accent animate-pulse"
                                : voiceState === "processing"
                                  ? "bg-muted text-foreground"
                                  : ""
                            }`}
                            onClick={handleVoiceInput}
                            title={voiceState === "idle" ? "Voice input (stub)" : voiceState === "listening" ? "Listening..." : "Processing..."}
                          >
                            {voiceState === "processing" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Mic className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            className="h-9 w-9 shrink-0 rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                            onClick={() => handleSend()}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isHomeContext && (
                        <div className="w-full min-w-0">
                          <Select value={homeProjectMode} onValueChange={handleHomeProjectModeChange}>
                            <SelectTrigger className="h-8 text-caption bg-sidebar-accent/50 border-sidebar-border">
                              <SelectValue placeholder="General mode" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              <SelectItem value={GENERAL_MODE_VALUE}>General mode</SelectItem>
                              {projects.map((projectItem) => (
                                <SelectItem key={`home-project-mode-${projectItem.id}`} value={projectItem.id}>
                                  {projectItem.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex items-center justify-end w-full">
                        {isHomeContext && homeProjectMode === GENERAL_MODE_VALUE && pendingGeneralProposalInput && (
                          <span className="text-[10px] text-muted-foreground">
                            Select a project to continue proposal generation.
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
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
