import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as store from "@/data/store";
import {
  getProjectDomainAccessForRole,
  seamAllowsEstimateExportCsv,
  seamEstimateFinanceVisibilityMode,
  seamCanViewSensitiveDetail,
  usePermission,
} from "@/lib/permissions";
import {
  resolveActionState,
  isActionEnabled,
  actionStateToControlProps,
  type ActionState,
  type PermissionOverrides,
} from "@/lib/permission-contract-actions";
import { can } from "@/lib/permission-matrix";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import { authenticateRuntimeAuth } from "@/test/runtime-auth";
import type { Member, MemberRole, User } from "@/types/entities";
import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function PermissionProbe({ projectId }: { projectId: string }) {
  const permission = usePermission(projectId);

  return (
    <div>
      <span data-testid="role">{permission.role}</span>
      <span data-testid="can-ai">{String(permission.can("ai.generate"))}</span>
      <span data-testid="can-invite">{String(permission.can("member.invite"))}</span>
      <span data-testid="can-sensitive">{String(seamCanViewSensitiveDetail(permission.seam))}</span>
    </div>
  );
}

function currentUser(): User {
  return {
    id: "profile-1",
    email: "owner@example.com",
    name: "Owner User",
    locale: "en",
    timezone: "UTC",
    plan: "pro",
    credits_free: 10,
    credits_paid: 20,
  };
}

function member(partial: Partial<Member>): Member {
  return {
    project_id: "project-1",
    user_id: "profile-1",
    role: "contractor",
    ai_access: "consult_only",
    credit_limit: 50,
    used_credits: 5,
    ...partial,
  };
}

describe("usePermission", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearStoredAuthProfile();
    clearDemoSession();
  });

  it("reads role and AI access from the workspace query cache instead of demo store getters", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "supabase");

    const getCurrentUserSpy = vi.spyOn(store, "getCurrentUser");
    const getMembersSpy = vi.spyOn(store, "getMembers");
    const queryClient = createQueryClient();
    const user = currentUser();
    const membersKey = workspaceQueryKeys.projectMembers(user.id, "project-1");

    authenticateRuntimeAuth(user.id);
    queryClient.setQueryData(workspaceQueryKeys.currentUser(user.id), user);
    queryClient.setQueryData(membersKey, [
      member({ role: "contractor", ai_access: "consult_only" }),
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("contractor");
    });
    expect(screen.getByTestId("can-ai")).toHaveTextContent("false");
    expect(screen.getByTestId("can-invite")).toHaveTextContent("false");
    expect(getCurrentUserSpy).not.toHaveBeenCalled();
    expect(getMembersSpy).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(membersKey, [
        member({ role: "co_owner", ai_access: "project_pool" }),
      ]);
    });

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("co_owner");
    });
    expect(screen.getByTestId("can-ai")).toHaveTextContent("true");
    expect(screen.getByTestId("can-invite")).toHaveTextContent("true");
  });

  it("applies fail-safe finance visibility when simulating local viewer and contractor roles", async () => {
    vi.stubEnv("VITE_WORKSPACE_SOURCE", "local");
    store.__unsafeResetStoreForTests();

    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });

    store.addProject({
      id: "project-1",
      owner_id: profile.id,
      title: "Workspace Project",
      type: "residential",
      project_mode: "contractor",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    store.addMember({
      project_id: "project-1",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      finance_visibility: "detail",
      credit_limit: 500,
      used_credits: 0,
    });

    setAuthRole("viewer");
    const firstClient = createQueryClient();
    const first = render(
      <QueryClientProvider client={firstClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("viewer");
    });
    expect(screen.getByTestId("can-sensitive")).toHaveTextContent("false");
    first.unmount();

    setAuthRole("contractor");
    const secondClient = createQueryClient();
    render(
      <QueryClientProvider client={secondClient}>
        <PermissionProbe projectId="project-1" />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("contractor");
    });
    expect(screen.getByTestId("can-sensitive")).toHaveTextContent("false");
  });
});

describe("getProjectDomainAccessForRole (HR domain)", () => {
  it("hides HR for viewer and contractor roles", () => {
    expect(getProjectDomainAccessForRole("viewer", "hr")).toBe("hidden");
    expect(getProjectDomainAccessForRole("contractor", "hr")).toBe("hidden");
  });

  it("grants manage for owner and co_owner", () => {
    expect(getProjectDomainAccessForRole("owner", "hr")).toBe("manage");
    expect(getProjectDomainAccessForRole("co_owner", "hr")).toBe("manage");
  });
});

describe("Track 1 estimate export + finance visibility seams", () => {
  function seamForRole(
    role: "owner" | "co_owner" | "contractor" | "viewer",
    finance_visibility?: "none" | "summary" | "detail",
  ): ProjectAuthoritySeam {
    return {
      projectId: "project-1",
      profileId: "profile-1",
      membership: {
        project_id: "project-1",
        user_id: "profile-1",
        role,
        viewer_regime: null,
        ai_access: "consult_only",
        finance_visibility: finance_visibility ?? "summary",
        credit_limit: 0,
        used_credits: 0,
      },
      project: undefined,
    };
  }

  it("allows estimate CSV export only for owner and co_owner", () => {
    expect(seamAllowsEstimateExportCsv(seamForRole("viewer"))).toBe(false);
    expect(seamAllowsEstimateExportCsv(seamForRole("contractor"))).toBe(false);
    expect(seamAllowsEstimateExportCsv(seamForRole("co_owner"))).toBe(true);
    expect(seamAllowsEstimateExportCsv(seamForRole("owner"))).toBe(true);
  });

  it("classifies estimate finance visibility mode from membership finance_visibility", () => {
    expect(seamEstimateFinanceVisibilityMode(seamForRole("viewer", "detail"))).toBe("detail");
    expect(seamEstimateFinanceVisibilityMode(seamForRole("viewer", "summary"))).toBe("summary");
    expect(seamEstimateFinanceVisibilityMode(seamForRole("viewer", "none"))).toBe("none");
  });
});

describe("seamCanViewSensitiveDetail", () => {
  function seam(partial: Partial<ProjectAuthoritySeam>): ProjectAuthoritySeam {
    return {
      projectId: "project-1",
      profileId: "profile-1",
      project: null,
      membership: null,
      ...partial,
    };
  }

  it("fails closed when membership is missing for non-owners", () => {
    expect(seamCanViewSensitiveDetail(seam({ membership: null }))).toBe(false);
  });

  it("allows the project owner even before the owner membership row hydrates", () => {
    expect(seamCanViewSensitiveDetail(seam({
      profileId: "profile-owner",
      project: {
        id: "project-1",
        owner_id: "profile-owner",
        title: "Workspace Project",
        type: "residential",
        project_mode: "contractor",
        automation_level: "assisted",
        current_stage_id: "",
        progress_pct: 0,
      },
      membership: null,
    }))).toBe(true);
  });

  it("fails closed when finance visibility is missing or summary-only for non-owners", () => {
    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: undefined }),
    }))).toBe(false);

    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: "summary" }),
    }))).toBe(false);
  });

  it("allows owners and explicit detail visibility", () => {
    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "owner", finance_visibility: undefined }),
    }))).toBe(true);

    expect(seamCanViewSensitiveDetail(seam({
      membership: member({ role: "co_owner", finance_visibility: "detail" }),
    }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Track 3: Contract action state resolver — golden preset tables
// ---------------------------------------------------------------------------

describe("resolveActionState — procurement presets match contract", () => {
  const roles: MemberRole[] = ["owner", "co_owner", "contractor", "viewer"];
  const actions = ["order", "receive", "use_from_stock"] as const;

  const expected: Record<string, Record<string, ActionState>> = {
    owner:      { order: "enabled",          receive: "enabled",          use_from_stock: "enabled" },
    co_owner:   { order: "enabled",          receive: "enabled",          use_from_stock: "enabled" },
    contractor: { order: "disabled_visible", receive: "disabled_visible", use_from_stock: "disabled_visible" },
    viewer:     { order: "hidden",           receive: "hidden",           use_from_stock: "hidden" },
  };

  for (const role of roles) {
    for (const action of actions) {
      it(`${role} / ${action} → ${expected[role][action]}`, () => {
        expect(resolveActionState(role, "procurement", action)).toBe(expected[role][action]);
      });
    }
  }
});

describe("resolveActionState — estimate presets match contract", () => {
  const actions = ["edit_estimate_rows", "edit_estimate_structure", "export_csv"] as const;

  const expected: Record<string, Record<string, ActionState>> = {
    owner:      { edit_estimate_rows: "enabled", edit_estimate_structure: "enabled", export_csv: "enabled" },
    co_owner:   { edit_estimate_rows: "enabled", edit_estimate_structure: "enabled", export_csv: "enabled" },
    contractor: { edit_estimate_rows: "hidden",  edit_estimate_structure: "hidden",  export_csv: "hidden" },
    viewer:     { edit_estimate_rows: "hidden",  edit_estimate_structure: "hidden",  export_csv: "hidden" },
  };

  for (const role of ["owner", "co_owner", "contractor", "viewer"] as MemberRole[]) {
    for (const action of actions) {
      it(`${role} / ${action} → ${expected[role][action]}`, () => {
        expect(resolveActionState(role, "estimate", action)).toBe(expected[role][action]);
      });
    }
  }
});

describe("resolveActionState — tasks presets match contract", () => {
  const actions = ["change_status", "edit_checklist", "comment", "upload_document", "upload_media", "manage_tasks"] as const;

  const expected: Record<string, Record<string, ActionState>> = {
    owner:      { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "enabled" },
    co_owner:   { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "enabled" },
    contractor: { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "hidden" },
    viewer:     { change_status: "hidden",  edit_checklist: "hidden",  comment: "hidden",  upload_document: "hidden",  upload_media: "hidden",  manage_tasks: "hidden" },
  };

  for (const role of ["owner", "co_owner", "contractor", "viewer"] as MemberRole[]) {
    for (const action of actions) {
      it(`${role} / ${action} → ${expected[role][action]}`, () => {
        expect(resolveActionState(role, "tasks", action)).toBe(expected[role][action]);
      });
    }
  }
});

describe("resolveActionState — documents_media presets match contract", () => {
  const actions = ["upload", "delete", "rename_or_archive", "classify"] as const;

  const expected: Record<string, Record<string, ActionState>> = {
    owner:      { upload: "enabled", delete: "enabled", rename_or_archive: "enabled", classify: "enabled" },
    co_owner:   { upload: "enabled", delete: "enabled", rename_or_archive: "enabled", classify: "enabled" },
    contractor: { upload: "enabled", delete: "hidden",  rename_or_archive: "hidden",  classify: "hidden" },
    viewer:     { upload: "hidden",  delete: "hidden",  rename_or_archive: "hidden",  classify: "hidden" },
  };

  for (const role of ["owner", "co_owner", "contractor", "viewer"] as MemberRole[]) {
    for (const action of actions) {
      it(`${role} / ${action} → ${expected[role][action]}`, () => {
        expect(resolveActionState(role, "documents_media", action)).toBe(expected[role][action]);
      });
    }
  }
});

describe("resolveActionState — overrides take precedence over preset", () => {
  it("returns override value when provided", () => {
    const overrides: PermissionOverrides = {
      procurement: { order: "enabled" },
    };
    expect(resolveActionState("contractor", "procurement", "order", overrides)).toBe("enabled");
  });

  it("falls back to preset when override is undefined", () => {
    expect(resolveActionState("contractor", "procurement", "order", undefined)).toBe("disabled_visible");
    expect(resolveActionState("contractor", "procurement", "order", {})).toBe("disabled_visible");
  });
});

describe("isActionEnabled", () => {
  it("returns true only for enabled state", () => {
    expect(isActionEnabled("owner", "procurement", "order")).toBe(true);
    expect(isActionEnabled("contractor", "procurement", "order")).toBe(false);
    expect(isActionEnabled("viewer", "procurement", "order")).toBe(false);
  });
});

describe("actionStateToControlProps", () => {
  it("hidden → not visible", () => {
    const props = actionStateToControlProps("hidden");
    expect(props.visible).toBe(false);
    expect(props.disabled).toBe(true);
    expect(props.disabledReason).toBeUndefined();
  });

  it("disabled_visible → visible + disabled + reason", () => {
    const props = actionStateToControlProps("disabled_visible", { disabledReason: "Not allowed" });
    expect(props.visible).toBe(true);
    expect(props.disabled).toBe(true);
    expect(props.disabledReason).toBe("Not allowed");
  });

  it("disabled_visible → uses default reason when none provided", () => {
    const props = actionStateToControlProps("disabled_visible");
    expect(props.disabledReason).toBeDefined();
  });

  it("enabled → visible + interactive", () => {
    const props = actionStateToControlProps("enabled");
    expect(props.visible).toBe(true);
    expect(props.disabled).toBe(false);
    expect(props.disabledReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Track 3: Narrowed permission-matrix regression
// ---------------------------------------------------------------------------

describe("permission-matrix — narrowed contractor actions (Track 3)", () => {
  it("contractor can still do task and document actions", () => {
    expect(can("contractor", "task.create")).toBe(true);
    expect(can("contractor", "task.edit")).toBe(true);
    expect(can("contractor", "document.create")).toBe(true);
  });

  it("contractor AI access respects ai_access parameter", () => {
    expect(can("contractor", "ai.generate", "project_pool")).toBe(true);
    expect(can("contractor", "ai.generate", "consult_only")).toBe(false);
    expect(can("contractor", "ai.generate", "none")).toBe(false);
  });

  it("viewer cannot do any legacy actions", () => {
    expect(can("viewer", "ai.generate")).toBe(false);
    expect(can("viewer", "task.create")).toBe(false);
    expect(can("viewer", "member.invite")).toBe(false);
  });

  it("owner and co_owner can do all legacy actions", () => {
    expect(can("owner", "ai.generate")).toBe(true);
    expect(can("owner", "member.invite")).toBe(true);
    expect(can("co_owner", "estimate.approve")).toBe(true);
  });
});
