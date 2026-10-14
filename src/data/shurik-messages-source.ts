import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { resolveWorkspaceMode, type WorkspaceMode } from "@/data/workspace-source";
import type { ShurikMessage } from "@/types/entities";
import type { Database as MessagesDatabase } from "../../backend-truth/generated/supabase-types";

type NotificationRow = MessagesDatabase["public"]["Tables"]["notifications"]["Row"];
type TypedSupabaseClient = SupabaseClient<MessagesDatabase>;

const MESSAGE_COLUMNS = "id, profile_id, project_id, type, title, body, is_read, read_at, created_at, payload";
/** The panel is a short feed, not an archive; the newest hundred is more than it ever shows at once. */
const MESSAGES_LIMIT = 100;
const MONEY_TYPE_PREFIX = "billing_";
const BRIEFING_TYPE = "briefing";
const PEOPLE_TYPE_PREFIX = "people_";
const CLIENT_REPORT_REMINDER_TYPE = "client_report_reminder";

export interface ShurikMessageAction {
  label: string;
  href: string;
}

/** A stretch of a briefing line: plain text, or the name of something that can be opened. */
export interface ShurikBriefingPart {
  text: string;
  href?: string;
  /** The task that `href`, the project's tasks page, should open. */
  taskId?: string;
}

export interface ShurikBriefingLine {
  parts: ShurikBriefingPart[];
}

export interface ShurikMessagesSource {
  mode: WorkspaceMode["kind"];
  /** Newest first. */
  listMessages: () => Promise<ShurikMessage[]>;
  markRead: (ids: string[]) => Promise<void>;
  /** Calls back whenever the list may have changed. Returns the unsubscribe. */
  subscribe: (onChange: () => void) => () => void;
}

export function mapNotificationRowToShurikMessage(
  row: Pick<
    NotificationRow,
    "id" | "profile_id" | "project_id" | "type" | "title" | "body" | "is_read" | "read_at" | "created_at" | "payload"
  >,
): ShurikMessage {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as Record<string, unknown>)
    : {};

  return {
    id: row.id,
    user_id: row.profile_id,
    project_id: row.project_id,
    type: row.type,
    title: row.title,
    body: row.body,
    is_read: row.is_read,
    read_at: row.read_at,
    created_at: row.created_at,
    payload,
  };
}

export function isMoneyShurikMessage(message: Pick<ShurikMessage, "type">): boolean {
  return message.type.startsWith(MONEY_TYPE_PREFIX);
}

export function isBriefingShurikMessage(message: Pick<ShurikMessage, "type">): boolean {
  return message.type === BRIEFING_TYPE;
}

/** A comment or an assignment: what another person did in a project. */
export function isPeopleShurikMessage(message: Pick<ShurikMessage, "type">): boolean {
  return message.type.startsWith(PEOPLE_TYPE_PREFIX);
}

/** Shurik's reminder that a report for the client is ready to be looked at. */
export function isClientReportReminderShurikMessage(message: Pick<ShurikMessage, "type">): boolean {
  return message.type === CLIENT_REPORT_REMINDER_TYPE;
}

let subscriptionSeq = 0;

function hasControlSpaceOrBackslash(href: string): boolean {
  for (const char of href) {
    if (char === "\\" || char.charCodeAt(0) <= 0x20) return true;
  }
  return false;
}

/** A path inside this app. */
function isInAppPath(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//") || hasControlSpaceOrBackslash(href)) return false;
  try {
    const resolved = new URL(href, window.location.origin);
    return resolved.origin === window.location.origin && !resolved.pathname.startsWith("//");
  } catch {
    return false;
  }
}

/** The one button a message may carry. The text is written by the server, so the link is checked here. */
export function readShurikMessageAction(message: Pick<ShurikMessage, "payload">): ShurikMessageAction | null {
  const label = message.payload.action_label;
  const href = message.payload.action_href;
  if (typeof label !== "string" || label.trim().length === 0) return null;
  if (typeof href !== "string" || !isInAppPath(href)) return null;
  return { label, href };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The lines of a briefing, or null when the payload is not the shape the server writes; the
 * caller then shows the plain text. A link that does not lead inside the app loses the link only.
 */
export function readShurikBriefingLines(message: Pick<ShurikMessage, "payload">): ShurikBriefingLine[] | null {
  const rawLines = message.payload.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;

  const lines: ShurikBriefingLine[] = [];
  for (const rawLine of rawLines) {
    if (!isRecord(rawLine) || !Array.isArray(rawLine.parts) || rawLine.parts.length === 0) return null;
    const parts: ShurikBriefingPart[] = [];
    for (const rawPart of rawLine.parts) {
      if (!isRecord(rawPart) || typeof rawPart.text !== "string") return null;
      const part: ShurikBriefingPart = { text: rawPart.text };
      if (typeof rawPart.href === "string" && isInAppPath(rawPart.href)) {
        part.href = rawPart.href;
        if (typeof rawPart.task_id === "string") part.taskId = rawPart.task_id;
      }
      parts.push(part);
    }
    lines.push({ parts });
  }
  return lines;
}

export function countUnreadShurikMessages(messages: ShurikMessage[]): number {
  return messages.filter((message) => !message.is_read).length;
}

export function createBrowserShurikMessagesSource(mode: "demo" | "local"): ShurikMessagesSource {
  return {
    mode,
    async listMessages() {
      return store.getShurikMessages(store.getCurrentUserForMode(mode).id);
    },
    async markRead(ids: string[]) {
      store.markShurikMessagesRead(ids);
    },
    subscribe(onChange: () => void) {
      return store.subscribe(onChange);
    },
  };
}

export function createSupabaseShurikMessagesSource(
  supabase: TypedSupabaseClient,
  profileId: string,
): ShurikMessagesSource {
  return {
    mode: "supabase",
    async listMessages() {
      const { data, error } = await supabase
        .from("notifications")
        .select(MESSAGE_COLUMNS)
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MESSAGES_LIMIT);

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapNotificationRowToShurikMessage);
    },
    async markRead(ids: string[]) {
      if (ids.length === 0) return;

      // The client is granted exactly these two columns; any other one in the patch fails the whole write.
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in("id", ids)
        .eq("profile_id", profileId)
        .eq("is_read", false);

      if (error) {
        throw error;
      }
    },
    subscribe(onChange: () => void) {
      const changes = { schema: "public", table: "notifications", filter: `profile_id=eq.${profileId}` };
      // Inserts and updates only: a delete event would carry the id of a row that is not this user's.
      const channel = supabase
        // A topic of its own per subscription, for the reason given in `project-sync-events.ts`.
        .channel(`shurik-messages:${profileId}:${++subscriptionSeq}`)
        .on("postgres_changes", { event: "INSERT", ...changes }, () => onChange())
        .on("postgres_changes", { event: "UPDATE", ...changes }, () => onChange())
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    },
  };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

export async function getShurikMessagesSource(mode?: WorkspaceMode): Promise<ShurikMessagesSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserShurikMessagesSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseShurikMessagesSource(supabase, resolvedMode.profileId);
}
