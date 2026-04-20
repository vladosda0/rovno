import type { AIMessage } from "@/types/ai";

/** Match Edge `chatId` / `projectId` UUID expectations (same as `ai-assistant-client`). */
export const AI_PROJECT_PERSISTENCE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TRANSCRIPT_KEY_PREFIX = "rovno:ai-transcript:v1:";
const ARCHIVE_KEY_PREFIX = "rovno:ai-chat-archive:v1:";

const TRANSCRIPT_VERSION = 1 as const;
const MAX_MESSAGES = 250;
const MAX_SERIALIZED_CHARS = 700_000;
const MAX_ARCHIVE_ENTRIES = 20;
const MAX_ARCHIVE_MESSAGES = 150;
const MAX_CONTENT_CHARS = 50_000;

export interface AiChatTranscriptV1 {
  readonly version: typeof TRANSCRIPT_VERSION;
  readonly updatedAt: number;
  readonly activeChatId?: string;
  readonly messages: AIMessage[];
}

/** Optional routing hints when snapshots are trimmed or new AI surfaces add signals. */
export interface AiChatArchiveFeedHintsV1 {
  /** Thread included live-text work preview or legacy proposals (AI actions feed). */
  readonly aiActions?: boolean;
  /** Future: photo/document analysis or structured table edits in this chatId. */
  readonly hadDocumentOrPhotoAnalysis?: boolean;
}

export interface AiChatArchiveEntryV1 {
  readonly chatId: string;
  readonly endedAt: number;
  readonly previewLines: string[];
  readonly messagesSnapshot: AIMessage[];
  readonly feedHints?: AiChatArchiveFeedHintsV1;
}

export function isPersistableAiProjectId(projectId: string): boolean {
  return AI_PROJECT_PERSISTENCE_ID_RE.test(projectId.trim());
}

function transcriptStorageKey(projectId: string): string {
  return `${TRANSCRIPT_KEY_PREFIX}${projectId.trim()}`;
}

function archiveStorageKey(projectId: string): string {
  return `${ARCHIVE_KEY_PREFIX}${projectId.trim()}`;
}

function clipMessageContent(content: string): string {
  if (content.length <= MAX_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_CONTENT_CHARS)}…`;
}

function sanitizeMessagesForStorage(messages: readonly AIMessage[]): AIMessage[] {
  return messages.map((m) => ({
    ...m,
    content: clipMessageContent(m.content),
  }));
}

function trimMessagesForTranscript(messages: readonly AIMessage[]): AIMessage[] {
  const sanitized = sanitizeMessagesForStorage(messages);
  if (sanitized.length <= MAX_MESSAGES) return sanitized;
  return sanitized.slice(-MAX_MESSAGES);
}

export function trimMessagesForArchive(messages: readonly AIMessage[]): AIMessage[] {
  const sanitized = sanitizeMessagesForStorage(messages);
  if (sanitized.length <= MAX_ARCHIVE_MESSAGES) return sanitized;
  return sanitized.slice(-MAX_ARCHIVE_MESSAGES);
}

export function buildArchivePreviewLines(messages: readonly AIMessage[]): string[] {
  const firstUser = messages.find((m) => m.role === "user");
  const firstAssistant = messages.find((m) => m.role === "assistant");
  const lines: string[] = [];
  if (firstUser?.content?.trim()) {
    const t = firstUser.content.trim().replace(/\s+/g, " ");
    lines.push(t.length > 120 ? `${t.slice(0, 120)}…` : t);
  }
  if (firstAssistant?.content?.trim()) {
    const raw = firstAssistant.content.trim();
    const firstLine = raw.split(/\n/)[0]?.trim() ?? raw;
    const t = firstLine.replace(/\s+/g, " ");
    lines.push(t.length > 160 ? `${t.slice(0, 160)}…` : t);
  }
  if (lines.length === 0) lines.push("Conversation");
  return lines.slice(0, 3);
}

export function loadProjectTranscript(projectId: string): AiChatTranscriptV1 | null {
  if (!isPersistableAiProjectId(projectId) || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(transcriptStorageKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AiChatTranscriptV1>;
    if (parsed.version !== TRANSCRIPT_VERSION || !Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      version: TRANSCRIPT_VERSION,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
      activeChatId: typeof parsed.activeChatId === "string" ? parsed.activeChatId : undefined,
      messages: parsed.messages as AIMessage[],
    };
  } catch {
    return null;
  }
}

export function saveProjectTranscript(
  projectId: string,
  payload: { messages: readonly AIMessage[]; activeChatId?: string },
): void {
  if (!isPersistableAiProjectId(projectId) || typeof window === "undefined") return;
  try {
    const messages = trimMessagesForTranscript(payload.messages);
    const body: AiChatTranscriptV1 = {
      version: TRANSCRIPT_VERSION,
      updatedAt: Date.now(),
      activeChatId: payload.activeChatId,
      messages,
    };
    let json = JSON.stringify(body);
    if (json.length > MAX_SERIALIZED_CHARS) {
      let slim = messages;
      while (json.length > MAX_SERIALIZED_CHARS && slim.length > 1) {
        slim = slim.slice(Math.floor(slim.length * 0.85));
        json = JSON.stringify({
          ...body,
          messages: slim,
        });
      }
    }
    window.localStorage.setItem(transcriptStorageKey(projectId), json);
  } catch {
    /* quota / private mode */
  }
}

export function clearProjectTranscript(projectId: string): void {
  if (!isPersistableAiProjectId(projectId) || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(transcriptStorageKey(projectId));
  } catch {
    /* ignore */
  }
}

export function loadProjectChatArchives(projectId: string): AiChatArchiveEntryV1[] {
  if (!isPersistableAiProjectId(projectId) || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(archiveStorageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: AiChatArchiveEntryV1[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const chatId = typeof rec.chatId === "string" ? rec.chatId : "";
      const endedAt = typeof rec.endedAt === "number" ? rec.endedAt : 0;
      const previewLines = Array.isArray(rec.previewLines)
        ? rec.previewLines.filter((l): l is string => typeof l === "string")
        : [];
      const messagesSnapshot = Array.isArray(rec.messagesSnapshot)
        ? (rec.messagesSnapshot as AIMessage[])
        : [];
      if (!chatId || !AI_PROJECT_PERSISTENCE_ID_RE.test(chatId)) continue;
      let feedHints: AiChatArchiveFeedHintsV1 | undefined;
      const fh = rec.feedHints;
      if (fh && typeof fh === "object" && !Array.isArray(fh)) {
        const f = fh as Record<string, unknown>;
        feedHints = {
          aiActions: f.aiActions === true ? true : undefined,
          hadDocumentOrPhotoAnalysis: f.hadDocumentOrPhotoAnalysis === true ? true : undefined,
        };
        if (feedHints.aiActions === undefined && feedHints.hadDocumentOrPhotoAnalysis === undefined) {
          feedHints = undefined;
        }
      }
      out.push({ chatId, endedAt, previewLines, messagesSnapshot, feedHints });
    }
    return out;
  } catch {
    return [];
  }
}

export function prependProjectChatArchive(projectId: string, entry: AiChatArchiveEntryV1): void {
  if (!isPersistableAiProjectId(projectId) || typeof window === "undefined") return;
  try {
    const prev = loadProjectChatArchives(projectId);
    const next = [entry, ...prev.filter((e) => e.chatId !== entry.chatId)].slice(0, MAX_ARCHIVE_ENTRIES);
    window.localStorage.setItem(archiveStorageKey(projectId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
