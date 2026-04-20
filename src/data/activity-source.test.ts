import { describe, expect, it } from "vitest";
import { getEventGroupTimestampMs } from "@/lib/event-activity-timestamp";
import {
  mapActivityEventRowToEvent,
  mapNotificationRowToActivityNotification,
} from "@/data/activity-source";

function activityEventRow(
  overrides: Partial<Parameters<typeof mapActivityEventRowToEvent>[0]> = {},
) {
  return {
    id: "evt-1",
    project_id: "project-1",
    actor_profile_id: "profile-1",
    entity_type: "task",
    entity_id: "task-1",
    action_type: "task_created",
    payload: { title: "Install lights" },
    created_at: "2026-03-01T09:00:00.000Z",
    ...overrides,
  };
}

function notificationRow(
  overrides: Partial<Parameters<typeof mapNotificationRowToActivityNotification>[0]> = {},
) {
  return {
    id: "notif-1",
    profile_id: "profile-1",
    project_id: "project-1",
    type: "activity.task_created",
    title: "Task created",
    body: null,
    is_read: false,
    payload: {
      event_id: "evt-1",
      eventId: "evt-2",
      entity_type: "task",
      entity_id: "task-1",
      action_type: "task_created",
    },
    created_at: "2026-03-01T10:00:00.000Z",
    read_at: null,
    ...overrides,
  };
}

describe("activity-source helpers", () => {
  it("maps activity event rows to the frontend Event contract with safe defaults", () => {
    const event = mapActivityEventRowToEvent(activityEventRow({
      actor_profile_id: null,
      entity_id: null,
      payload: null,
    }));

    expect(event).toEqual({
      id: "evt-1",
      project_id: "project-1",
      actor_id: "",
      type: "task_created",
      object_type: "task",
      object_id: "",
      timestamp: "2026-03-01T09:00:00.000Z",
      payload: {},
    });
  });

  it("prefers payload semantic timestamps over created_at when mapping activity rows", () => {
    const event = mapActivityEventRowToEvent(activityEventRow({
      action_type: "estimate.status_changed",
      entity_type: "estimate_v2_project",
      created_at: "2026-04-20T12:00:00.000Z",
      payload: {
        activityAt: "2026-04-07T15:42:00.000Z",
      },
    }));

    expect(event.timestamp).toBe("2026-04-07T15:42:00.000Z");
    expect(getEventGroupTimestampMs(event)).toBe(Date.parse("2026-04-07T15:42:00.000Z"));
  });

  it("extracts notification linkage fields in the configured priority order", () => {
    const mapped = mapNotificationRowToActivityNotification(notificationRow({
      payload: {
        event_id: "evt-direct",
        eventId: "evt-camel",
        activity_event_id: "evt-snake",
        activityEventId: "evt-alt",
        entityType: "comment",
        objectId: "comment-1",
        actionType: "comment_added",
      },
    }));

    expect(mapped.notification).toEqual({
      id: "notif-1",
      user_id: "profile-1",
      project_id: "project-1",
      event_id: "evt-direct",
      is_read: false,
    });
    expect(mapped.bridge).toEqual({
      notificationId: "notif-1",
      compatibilityEventId: "evt-direct",
      projectId: "project-1",
      createdAt: "2026-03-01T10:00:00.000Z",
      directEventId: "evt-direct",
      objectType: "comment",
      objectId: "comment-1",
      actionType: "comment_added",
    });
  });

  it("falls back to a deterministic compatibility event id when no direct event link exists", () => {
    const mapped = mapNotificationRowToActivityNotification(notificationRow({
      project_id: null,
      payload: {
        object_type: "task",
        object_id: "task-22",
        type: "task_updated",
      },
    }));

    expect(mapped.notification).toEqual({
      id: "notif-1",
      user_id: "profile-1",
      project_id: "",
      event_id: "compat:notif-1",
      is_read: false,
    });
    expect(mapped.bridge).toEqual({
      notificationId: "notif-1",
      compatibilityEventId: "compat:notif-1",
      projectId: undefined,
      createdAt: "2026-03-01T10:00:00.000Z",
      directEventId: undefined,
      objectType: "task",
      objectId: "task-22",
      actionType: "task_updated",
    });
  });
});
