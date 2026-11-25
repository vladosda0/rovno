import type { SupabaseClient } from "@supabase/supabase-js";
import { mapKnowledgeBase } from "@/lib/ai-assistant-client";
import { homeAnswerId } from "@/lib/ai-answer-rating";
import { supabase } from "@/integrations/supabase/client";
import type { AIMessage } from "@/types/ai";

// The conversation outside a project (docs-library 6.1, 6.5): one per person, shared by the
// site and the bot, kept by the server, which also writes the answers into it. The site only
// reads it. The client types do not list this RPC, hence the untyped client here and only here.
const rawSupabase = supabase as unknown as SupabaseClient;

export interface HomeAiChatTurn {
  role: "user" | "assistant";
  text: string;
  knowledgeBaseSources?: unknown;
  knowledgeBaseMissing?: boolean;
  knowledgeBaseFallbackCountry?: string;
  /** An answer that asked which project: the buttons must survive a reload too. */
  needsProject?: boolean;
}

function isTurn(value: unknown): value is HomeAiChatTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as Record<string, unknown>;
  return (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string";
}

export interface HomeAiChatRead {
  /** When the read began, `performance.now()`: everything finished before this is in it. */
  startedAt: number;
  turns: HomeAiChatTurn[];
}

export async function readHomeAiChat(): Promise<HomeAiChatRead> {
  const startedAt = performance.now();
  return { startedAt, turns: await fetchHomeAiChatTurns() };
}

export async function fetchHomeAiChatTurns(): Promise<HomeAiChatTurn[]> {
  const { data, error } = await rawSupabase.rpc("get_home_ai_chat_session");
  if (error) throw error;
  const recent = (data as { recentTurns?: unknown } | null)?.recentTurns;
  return Array.isArray(recent) ? recent.filter(isTurn) : [];
}

export function homeTurnsToMessages(turns: readonly HomeAiChatTurn[]): AIMessage[] {
  return turns.map((turn, index) => {
    if (turn.role === "user") {
      return { id: `home-user:${index}`, role: "user", content: turn.text, timestamp: "" };
    }
    const id = homeAnswerId(turn.text);
    const question = turns[index - 1]?.role === "user" ? turns[index - 1].text : "";
    const knowledgeBase = mapKnowledgeBase(turn.knowledgeBaseSources, turn.knowledgeBaseMissing, turn.knowledgeBaseFallbackCountry);
    return {
      id,
      role: "assistant",
      content: turn.text,
      timestamp: "",
      ...(turn.needsProject === true ? { needsProjectQuestion: question } : {}),
      ...(knowledgeBase ? { liveTextAssistantV1: { version: 1 as const, grounding: "ungrounded" as const, knowledgeBase } } : {}),
    };
  });
}

/**
 * One question and its answer in this visit. Shown after the history until a read of the
 * history taken after it finished holds it, so nothing is ever matched turn by turn.
 */
export interface HomeExchange {
  id: string;
  question: string;
  timestamp: string;
  status: "pending" | "done" | "failed";
  /** The answer, or the failure text on a failed exchange. */
  answer?: AIMessage;
  /** `performance.now()`: a wall clock stepping back must not hold a read for later forever. */
  finishedAt?: number;
  /** The last answer of the history when this was sent, to see that a later one has come. */
  lastAnswerAtSend?: string;
  /** A regeneration: the same question again, which is not drawn twice. */
  hideQuestion?: boolean;
}

export function exchangesToMessages(exchanges: readonly HomeExchange[]): AIMessage[] {
  return exchanges.flatMap((exchange) => {
    const question: AIMessage[] = exchange.hideQuestion
      ? []
      : [{ id: `${exchange.id}:question`, role: "user", content: exchange.question, timestamp: exchange.timestamp }];
    return exchange.answer ? [...question, exchange.answer] : question;
  });
}

const SERVER_TEXT_LIMIT = 4000;

function serverText(text: string): string {
  return text.trim().slice(0, SERVER_TEXT_LIMIT);
}

/**
 * What stays after a history read begun at `readAt`. A finished exchange goes once the read is
 * newer. The text comparison guards against losing an answer the server did not keep (the
 * privacy short path, a failed write): that one stays, after the history. A failure goes when
 * the history ends on its question with a new answer: the server replied after the client
 * stopped waiting.
 */
export function settleHomeExchanges(
  exchanges: readonly HomeExchange[],
  history: readonly HomeAiChatTurn[],
  readAt: number,
): HomeExchange[] {
  const kept = new Set(history.filter((turn) => turn.role === "assistant").map((turn) => serverText(turn.text)));
  const lastQuestion = history.filter((turn) => turn.role === "user").at(-1)?.text;
  const lastAnswer = history.filter((turn) => turn.role === "assistant").at(-1)?.text;
  return exchanges.filter((exchange) => {
    if (exchange.status === "pending" || exchange.finishedAt === undefined || readAt < exchange.finishedAt) return true;
    if (exchange.status === "failed") {
      return lastQuestion === undefined
        || serverText(lastQuestion) !== serverText(exchange.question)
        || lastAnswer === exchange.lastAnswerAtSend;
    }
    return !exchange.answer || !kept.has(serverText(exchange.answer.content));
  });
}

/** A read that began before an exchange finished cannot settle it, so another one is due. */
export function needsLaterHomeRead(exchanges: readonly HomeExchange[], readAt: number): boolean {
  return exchanges.some((exchange) => exchange.finishedAt !== undefined && readAt < exchange.finishedAt);
}

/** A success closes the failures before it: what the server kept of them the history shows itself. */
export function finishHomeExchange(exchanges: readonly HomeExchange[], id: string, answer: AIMessage, now: number): HomeExchange[] {
  return exchanges
    .filter((exchange) => exchange.status !== "failed")
    .map((exchange) => (exchange.id === id ? { ...exchange, answer, status: "done" as const, finishedAt: now } : exchange));
}

export function homeChatHistoryKey(profileId: string) {
  return ["home-ai-chat", profileId] as const;
}

export interface HomeChatSession {
  exchanges: HomeExchange[];
  pending: boolean;
}

// Above the panel on purpose: closing it, or a trip into a project, must not lose an answer on
// its way or the failure it turned into.
const sessions = new Map<string, HomeChatSession>();
const sessionListeners = new Set<() => void>();

export function readHomeChatSession(profileId: string): HomeChatSession {
  let session = sessions.get(profileId);
  if (!session) {
    session = { exchanges: [], pending: false };
    sessions.set(profileId, session);
  }
  return session;
}

export function updateHomeChatSession(profileId: string, change: (session: HomeChatSession) => Partial<HomeChatSession>): void {
  const session = readHomeChatSession(profileId);
  sessions.set(profileId, { ...session, ...change(session) });
  sessionListeners.forEach((listener) => listener());
}

export function subscribeHomeChatSessions(listener: () => void): () => void {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/** Test hook: every case starts with no turns of its own. */
export function resetHomeChatSessionsForTests(): void {
  sessions.clear();
}
