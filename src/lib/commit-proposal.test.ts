import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commitProposal } from "@/lib/commit-proposal";
import { __unsafeResetStoreForTests, getCurrentUser, getEvents, getProject, getStages, getTask } from "@/data/store";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";
import * as workspaceSource from "@/data/workspace-source";

describe("commitProposal", () => {
  beforeEach(() => {
    clearDemoSession();
    enterDemoSession("project-1");
    __unsafeResetStoreForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses explicit actor attribution instead of the local store current user", async () => {
    const explicitActor = {
      ...getCurrentUser(),
      id: "supabase-user-1",
      email: "supabase-user@example.com",
      name: "Supabase User",
    };

    const result = await commitProposal({
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
      workspaceMode: { kind: "demo" },
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

  it("routes AI project creation through the workspace mutation seam and preserves local stages", async () => {
    const createWorkspaceProjectSpy = vi.spyOn(workspaceSource, "createWorkspaceProject");

    const result = await commitProposal({
      id: "proposal-create-project-local",
      project_id: "__new__",
      type: "create_project",
      summary: "Create a local AI project",
      changes: [
        {
          action: "create",
          entity_type: "project",
          label: "Apartment Renovation",
          after: "residential",
        },
        {
          action: "create",
          entity_type: "stage",
          label: "Demolition",
        },
        {
          action: "create",
          entity_type: "stage",
          label: "Finishing",
        },
      ],
      status: "pending",
    }, {
      actor: {
        currentUser: getCurrentUser(),
      },
      workspaceMode: { kind: "demo" },
      eventSource: "ai",
      eventActorId: "ai",
    });

    expect(result.success).toBe(true);
    expect(createWorkspaceProjectSpy).toHaveBeenCalledWith(
      { kind: "demo" },
      {
        title: "Apartment Renovation",
        type: "residential",
        projectMode: "contractor",
        ownerId: getCurrentUser().id,
      },
      {
        bootstrapLocalProject: false,
      },
    );
    expect(result.projectId).toBeTruthy();
    expect(result.createdProject).toMatchObject({
      id: result.projectId,
      title: "Apartment Renovation",
      automation_level: "full",
    });
    expect(getProject(result.projectId!)).toMatchObject({
      title: "Apartment Renovation",
      automation_level: "full",
    });
    expect(getStages(result.projectId!).map((stage) => stage.title)).toEqual([
      "Demolition",
      "Finishing",
    ]);
    expect(getEvents(result.projectId!).map((event) => event.type)).toEqual(expect.arrayContaining([
      "stage_created",
      "project_created",
    ]));
  });

  it("creates only the project through the seam in Supabase mode", async () => {
    const createdProject = {
      id: "project-supabase-ai",
      owner_id: "profile-1",
      title: "Office Build-out",
      type: "commercial",
      project_mode: "contractor" as const,
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    };
    const createWorkspaceProjectSpy = vi.spyOn(workspaceSource, "createWorkspaceProject")
      .mockResolvedValue(createdProject);

    const result = await commitProposal({
      id: "proposal-create-project-supabase",
      project_id: "__new__",
      type: "create_project",
      summary: "Create a Supabase AI project",
      changes: [
        {
          action: "create",
          entity_type: "project",
          label: "Office Build-out",
          after: "commercial",
        },
        {
          action: "create",
          entity_type: "stage",
          label: "Space Planning",
        },
      ],
      status: "pending",
    }, {
      actor: {
        currentUser: getCurrentUser(),
      },
      workspaceMode: { kind: "supabase", profileId: "profile-1" },
      eventSource: "ai",
      eventActorId: "ai",
    });

    expect(result).toMatchObject({
      success: true,
      count: 1,
      projectId: createdProject.id,
      createdProject,
      created: [
        {
          type: "project",
          id: createdProject.id,
          label: "Office Build-out",
          route: `/project/${createdProject.id}/dashboard`,
        },
      ],
      eventIds: [],
    });
    expect(createWorkspaceProjectSpy).toHaveBeenCalledWith(
      { kind: "supabase", profileId: "profile-1" },
      {
        title: "Office Build-out",
        type: "commercial",
        projectMode: "contractor",
        ownerId: getCurrentUser().id,
      },
      {
        bootstrapLocalProject: false,
      },
    );
    expect(getProject(createdProject.id)).toBeUndefined();
    expect(getStages(createdProject.id)).toEqual([]);
    expect(getEvents(createdProject.id)).toEqual([]);
  });
});
