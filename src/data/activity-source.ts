import type { SupabaseClient } from "@supabase/supabase-js";
import * as store from "@/data/store";
import { resolveWorkspaceMode, type WorkspaceMode } from "@/data/workspace-source";
import type { Event, Notification } from "@/types/entities";
import type { Database as ActivityDatabase, Json } from "../../backend-truth/generated/supabase-types";

type ActivityEventRow = ActivityDatabase["public"]["Tables"]["activity_events"]["Row"];
type NotificationRow = ActivityDatabase["public"]["Tables"]["notifications"]["Row"];
type TypedSupabaseClient = SupabaseClient<ActivityDatabase>;

const DIRECT_EVENT_ID_KEYS = ["event_id", "eventId", "activity_event_id", "activityEventId"] as const;
const OBJECT_TYPE_KEYS = ["entity_type", "entityType", "object_type", "objectType"] as const;
const OBJECT_ID_KEYS = ["entity_id", "entityId", "object_id", "objectId"] as const;
const ACTION_TYPE_KEYS = ["action_type", "actionType", "type"] as const;

export interface ActivityNotificationBridge {
  notificationId: string;
  compatibilityEventId: string;
  projectId?: string;
  createdAt?: string;
  directEventId?: string;
  objectType?: string;
  objectId?: string;
  actionType?: string;
}

export interface ActivityNotificationsResult {
  notifications: Notification[];
  bridges: ActivityNotificationBridge[];
}

export interface ActivitySource {
  mode: WorkspaceMode["kind"];
  getProjectEvents: (projectId: string) => Promise<Event[]>;
  getCurrentUserNotifications: () => Promise<ActivityNotificationsResult>;
  getCurrentUserUnreadNotificationCount: () => Promise<number>;
}

function toPayloadRecord(value: Json): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function mapActivityEventRowToEvent(row: ActivityEventRow): Event {
  return {
    id: row.id,
    project_id: row.project_id,
    actor_id: row.actor_profile_id ?? "",
    type: row.action_type as Event["type"],
    object_type: row.entity_type,
    object_id: row.entity_id ?? "",
    timestamp: row.created_at,
    payload: toPayloadRecord(row.payload),
  };
}

export function mapNotificationRowToActivityNotification(
  row: NotificationRow,
): { notification: Notification; bridge: ActivityNotificationBridge } {
  const payload = toPayloadRecord(row.payload);
  const directEventId = readString(payload, DIRECT_EVENT_ID_KEYS);
  // Temporary bridge until backend notifications expose a first-class event reference.
  const compatibilityEventId = directEventId ?? `compat:${row.id}`;

  return {
    notification: {
      id: row.id,
      user_id: row.profile_id,
      project_id: row.project_id ?? "",
      event_id: compatibilityEventId,
      is_read: row.is_read,
    },
    bridge: {
      notificationId: row.id,
      compatibilityEventId,
      projectId: row.project_id ?? undefined,
      createdAt: row.created_at,
      directEventId,
      objectType: readString(payload, OBJECT_TYPE_KEYS),
      objectId: readString(payload, OBJECT_ID_KEYS),
      actionType: readString(payload, ACTION_TYPE_KEYS),
    },
  };
}

export function mapBrowserNotificationToActivityNotification(
  notification: Notification,
): { notification: Notification; bridge: ActivityNotificationBridge } {
  return {
    notification,
    bridge: {
      notificationId: notification.id,
      compatibilityEventId: notification.event_id,
      projectId: notification.project_id || undefined,
      directEventId: notification.event_id || undefined,
    },
  };
}

export function countUnreadNotifications(notifications: Notification[]): number {
  return notifications.filter((notification) => !notification.is_read).length;
}

export function resolveNotificationEvent(
  bridge: ActivityNotificationBridge,
  projectEvents: Event[],
): Event | undefined {
  if (bridge.directEventId) {
    const directMatch = projectEvents.find((event) => event.id === bridge.directEventId);
    if (directMatch) {
      return directMatch;
    }
  }

  if (!bridge.objectType || !bridge.objectId) {
    return undefined;
  }

  let candidates = projectEvents.filter((event) =>
    event.object_type === bridge.objectType && event.object_id === bridge.objectId,
  );

  if (bridge.actionType) {
    candidates = candidates.filter((event) => event.type === bridge.actionType);
  }

  if (candidates.length === 0) {
    return undefined;
  }

  if (!bridge.createdAt) {
    return candidates[0];
  }

  const createdAt = Date.parse(bridge.createdAt);
  if (Number.isNaN(createdAt)) {
    return candidates[0];
  }

  return candidates.find((event) => Date.parse(event.timestamp) <= createdAt) ?? candidates[0];
}

export function buildNotificationEventMap(input: {
  bridges: ActivityNotificationBridge[];
  eventsByProjectId: Record<string, Event[]>;
}): Record<string, Event> {
  const eventMap: Record<string, Event> = {};

  for (const bridge of input.bridges) {
    if (!bridge.projectId) {
      continue;
    }

    const projectEvents = input.eventsByProjectId[bridge.projectId] ?? [];
    const event = resolveNotificationEvent(bridge, projectEvents);
    if (event) {
      eventMap[bridge.notificationId] = event;
    }
  }

  return eventMap;
}

function createBrowserNotificationsResult(mode: "demo" | "local"): ActivityNotificationsResult {
  const user = store.getCurrentUserForMode(mode);
  const notifications = store.getNotifications(user.id);
  const mapped = notifications.map(mapBrowserNotificationToActivityNotification);

  return {
    notifications: mapped.map((entry) => entry.notification),
    bridges: mapped.map((entry) => entry.bridge),
  };
}

function createBrowserActivitySource(mode: "demo" | "local"): ActivitySource {
  return {
    mode,
    async getProjectEvents(projectId: string) {
      return store.getEvents(projectId);
    },
    async getCurrentUserNotifications() {
      return createBrowserNotificationsResult(mode);
    },
    async getCurrentUserUnreadNotificationCount() {
      const user = store.getCurrentUserForMode(mode);
      return store.getUnreadNotificationCount(user.id);
    },
  };
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

function createSupabaseActivitySource(
  supabase: TypedSupabaseClient,
  profileId: string,
): ActivitySource {
  return {
    mode: "supabase",
    async getProjectEvents(projectId: string) {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id, project_id, actor_profile_id, entity_type, entity_id, action_type, payload, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []).map(mapActivityEventRowToEvent);
    },
    async getCurrentUserNotifications() {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      const mapped = (data ?? []).map(mapNotificationRowToActivityNotification);

      return {
        notifications: mapped.map((entry) => entry.notification),
        bridges: mapped.map((entry) => entry.bridge),
      };
    },
    async getCurrentUserUnreadNotificationCount() {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .eq("is_read", false);

      if (error) {
        throw error;
      }

      return count ?? 0;
    },
  };
}

export async function getActivitySource(
  mode?: WorkspaceMode,
): Promise<ActivitySource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserActivitySource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseActivitySource(supabase, resolvedMode.profileId);
}
