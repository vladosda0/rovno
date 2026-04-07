import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitProposal, type CommitResult } from "@/lib/commit-proposal";
import type { AIProposal, ProposalChange } from "@/types/ai";
import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import type { FinanceVisibility, MemberRole } from "@/types/entities";
import { __unsafeResetStoreForTests } from "@/data/store";
import { clearDemoSession, enterDemoSession, setAuthRole } from "@/lib/auth-state";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seamForRole(
  role: MemberRole,
  finance_visibility: FinanceVisibility = "none",
): ProjectAuthoritySeam {
  return {
    projectId: "project-1",
    profileId: "profile-1",
    membership: {
      project_id: "project-1",
      user_id: "profile-1",
      role,
      ai_access: "project_pool",
      finance_visibility,
      credit_limit: 100,
      used_credits: 0,
    },
    project: undefined,
  };
}

function makeProposal(type: string): AIProposal {
  const changeMap: Record<string, ProposalChange[]> = {
    add_task: [{ entity_type: "task", action: "create", label: "Test task", after: "not_started" }],
    update_estimate: [{ entity_type: "estimate_item", action: "update", label: "Line item", before: "100", after: "200" }],
    add_procurement: [{ entity_type: "procurement_item", action: "create", label: "Nails", after: "500 ₽" }],
    generate_document: [{ entity_type: "document", action: "create", label: "Contract", after: "Draft v1" }],
  };
  return {
    id: `proposal-test-${Date.now()}`,
    project_id: "project-1",
    type,
    summary: `Test ${type}`,
    changes: changeMap[type] ?? [],
    status: "pending",
  };
}

// ---------------------------------------------------------------------------
// Setup — use demo store seeded state
// ---------------------------------------------------------------------------

beforeEach(() => {
  sessionStorage.clear();
  __unsafeResetStoreForTests();
  clearDemoSession();
  enterDemoSession("project-1");
  setAuthRole("owner");
});

// ---------------------------------------------------------------------------
// Contract path: ai_enforcement.can_execute_hidden_actions = false
// ---------------------------------------------------------------------------

describe("commitProposal — hidden action enforcement", () => {
  it("viewer cannot commit add_task (tasks.manage_tasks = hidden)", () => {
    const result = commitProposal(makeProposal("add_task"), {
      authoritySeam: seamForRole("viewer"),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("viewer cannot commit update_estimate (estimate.edit_estimate_rows = hidden)", () => {
    const result = commitProposal(makeProposal("update_estimate"), {
      authoritySeam: seamForRole("viewer"),
    });
    expect(result.success).toBe(false);
  });

  it("viewer cannot commit add_procurement (procurement.order = hidden)", () => {
    const result = commitProposal(makeProposal("add_procurement"), {
      authoritySeam: seamForRole("viewer"),
    });
    expect(result.success).toBe(false);
  });

  it("viewer cannot commit generate_document (documents_media.upload = hidden)", () => {
    const result = commitProposal(makeProposal("generate_document"), {
      authoritySeam: seamForRole("viewer"),
    });
    expect(result.success).toBe(false);
  });

  it("contractor cannot commit add_task (tasks.manage_tasks = hidden)", () => {
    const result = commitProposal(makeProposal("add_task"), {
      authoritySeam: seamForRole("contractor"),
    });
    expect(result.success).toBe(false);
  });

  it("contractor cannot commit update_estimate (estimate.edit_estimate_rows = hidden)", () => {
    const result = commitProposal(makeProposal("update_estimate"), {
      authoritySeam: seamForRole("contractor"),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract path: ai_enforcement.can_execute_disabled_visible_actions = false
// ---------------------------------------------------------------------------

describe("commitProposal — disabled_visible action enforcement", () => {
  it("contractor cannot commit add_procurement (procurement.order = disabled_visible)", () => {
    const result = commitProposal(makeProposal("add_procurement"), {
      authoritySeam: seamForRole("contractor"),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not available");
  });
});

// ---------------------------------------------------------------------------
// Contract path: ai_enforcement.confirmation_does_not_grant_permission = true
// ---------------------------------------------------------------------------

describe("commitProposal — confirmation does not grant permission", () => {
  it("confirmed proposal for viewer still fails at commit time", () => {
    const proposal = makeProposal("add_task");
    proposal.status = "confirmed" as never;
    const result = commitProposal(proposal, {
      authoritySeam: seamForRole("viewer"),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract path: enabled actions succeed for authorized roles
// ---------------------------------------------------------------------------

describe("commitProposal — enabled actions succeed", () => {
  it("owner can commit add_task", () => {
    const result = commitProposal(makeProposal("add_task"), {
      authoritySeam: seamForRole("owner", "detail"),
    });
    expect(result.success).toBe(true);
    expect(result.created.length).toBeGreaterThan(0);
  });

  it("owner can commit add_procurement", () => {
    const result = commitProposal(makeProposal("add_procurement"), {
      authoritySeam: seamForRole("owner", "detail"),
    });
    expect(result.success).toBe(true);
  });

  it("co_owner can commit update_estimate", () => {
    const result = commitProposal(makeProposal("update_estimate"), {
      authoritySeam: seamForRole("co_owner", "detail"),
    });
    expect(result.success).toBe(true);
  });

  it("contractor can commit generate_document (documents_media.upload = enabled)", () => {
    const result = commitProposal(makeProposal("generate_document"), {
      authoritySeam: seamForRole("contractor"),
    });
    expect(result.success).toBe(true);
  });
});
