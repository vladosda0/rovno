import { beforeEach, describe, expect, it } from "vitest";
import { commitProposal } from "@/lib/commit-proposal";
import { __unsafeResetStoreForTests, getCurrentUser, getEvents, getTask } from "@/data/store";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";

describe("commitProposal", () => {
  beforeEach(() => {
    clearDemoSession();
    enterDemoSession("project-1");
    __unsafeResetStoreForTests();
  });

  it("uses explicit actor attribution instead of the local store current user", () => {
    const explicitActor = {
      ...getCurrentUser(),
      id: "supabase-user-1",
      email: "supabase-user@example.com",
      name: "Supabase User",
    };

    const result = commitProposal({
      id: "proposal-runtime-actor",
      project_id: "project-1",
      type: "add_task",
      summary: "Create one actor-attributed task",
      changes: [
        {
          action: "create",
          entity_type: "task",
          label: "Runtime actor task",
        },
      ],
      status: "pending",
    }, {
      actor: {
        currentUser: explicitActor,
        role: "owner",
        aiAccess: "project_pool",
      },
      eventSource: "user",
    });

    expect(result.success).toBe(true);
    expect(result.created[0]?.type).toBe("task");

    const createdTask = getTask(result.created[0]!.id);
    expect(createdTask?.assignee_id).toBe(explicitActor.id);

    const createdTaskEvents = getEvents("project-1").filter((event) => (
      event.object_id === result.created[0]?.id
      && event.type === "task_created"
    ));
    expect(createdTaskEvents.at(-1)?.actor_id).toBe(explicitActor.id);
  });
});
