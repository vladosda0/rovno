import { describe, expect, it } from "vitest";
import { buildAIProjectContext, type AIContextInputs, type AIContextPack } from "@/lib/ai-project-context";
import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import type { FinanceVisibility, MemberRole } from "@/types/entities";

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

const BASE_INPUTS: AIContextInputs = {
  project: { title: "Test Project", type: "residential", progress_pct: 42 },
  stages: [{ title: "Demolition", status: "open" }, { title: "Finishing", status: "open" }],
  tasks: [{ status: "done" }, { status: "not_started" }, { status: "blocked" }],
  financeSummary: {
    projectId: "project-1",
    projectTitle: "Test Project",
    currency: "RUB",
    hasEstimate: true,
    status: "active",
    stageCount: 2,
    workCount: 5,
    lineCount: 10,
    plannedBudgetCents: 500_000_00,
    spentCents: 120_000_00,
    toBePaidCents: 380_000_00,
    varianceCents: 0,
    percentSpent: 24,
    percentProfitability: 30,
  },
  procurementSummary: {
    projectId: "project-1",
    projectTitle: "Test Project",
    rows: [],
    totalCount: 8,
    requestedCount: 3,
    orderedCount: 4,
    inStockCount: 1,
    requestedTotal: 100_000,
    orderedTotal: 250_000,
    inStockTotal: 50_000,
    inStockPlannedTotal: 45_000,
    inStockActualTotal: 48_000,
  },
  events: [],
  memberCount: 4,
  userCredits: 30,
};

// ---------------------------------------------------------------------------
// Contract path: ai_enforcement.can_reveal_hidden_fields = false
// ---------------------------------------------------------------------------

describe("buildAIProjectContext — domain visibility", () => {
  it("hides HR domain for viewer (contract: domains.hr.per_role.viewer.domain_access = hidden)", () => {
    const pack = buildAIProjectContext(seamForRole("viewer"), BASE_INPUTS);
    expect(pack._meta.hiddenDomains).toContain("hr");
  });

  it("hides HR domain for contractor (contract: domains.hr.per_role.contractor.domain_access = hidden)", () => {
    const pack = buildAIProjectContext(seamForRole("contractor"), BASE_INPUTS);
    expect(pack._meta.hiddenDomains).toContain("hr");
  });

  it("includes HR domain for owner", () => {
    const pack = buildAIProjectContext(seamForRole("owner", "detail"), BASE_INPUTS);
    expect(pack._meta.hiddenDomains).not.toContain("hr");
  });

  it("hides participants for viewer (contract: domains.participants.per_role.viewer = hidden)", () => {
    const pack = buildAIProjectContext(seamForRole("viewer"), BASE_INPUTS);
    expect(pack.members).toBeNull();
    expect(pack._meta.hiddenDomains).toContain("participants");
  });

  it("hides participants for contractor", () => {
    const pack = buildAIProjectContext(seamForRole("contractor"), BASE_INPUTS);
    expect(pack.members).toBeNull();
  });

  it("includes participants for co_owner", () => {
    const pack = buildAIProjectContext(seamForRole("co_owner", "detail"), BASE_INPUTS);
    expect(pack.members).toBe(4);
  });
});

describe("buildAIProjectContext — procurement money stripped", () => {
  it("never includes monetary totals (contract: procurement summary = no money)", () => {
    const roles: MemberRole[] = ["viewer", "contractor", "co_owner", "owner"];
    for (const role of roles) {
      const pack = buildAIProjectContext(seamForRole(role, "detail"), BASE_INPUTS);
      if (pack.procurement) {
        const json = JSON.stringify(pack.procurement);
        expect(json).not.toContain("requestedTotal");
        expect(json).not.toContain("orderedTotal");
        expect(json).not.toContain("inStockTotal");
        expect(json).not.toContain("inStockPlannedTotal");
        expect(json).not.toContain("inStockActualTotal");
      }
    }
  });

  it("includes only operational counts in procurement context", () => {
    const pack = buildAIProjectContext(seamForRole("owner", "detail"), BASE_INPUTS);
    expect(pack.procurement).toEqual({
      total: 8,
      requested: 3,
      ordered: 4,
      inStock: 1,
    });
  });
});

describe("buildAIProjectContext — estimate finance gating", () => {
  it("includes estimate status for summary finance visibility", () => {
    const pack = buildAIProjectContext(seamForRole("viewer", "summary"), BASE_INPUTS);
    expect(pack.estimate).not.toBeNull();
    expect(pack.estimate!.status).toBe("active");
    expect(pack.estimate!.hasEstimate).toBe(true);
  });

  it("nullifies estimate status for none finance visibility", () => {
    const pack = buildAIProjectContext(seamForRole("viewer", "none"), BASE_INPUTS);
    expect(pack.estimate).not.toBeNull();
    expect(pack.estimate!.status).toBeNull();
    expect(pack.estimate!.hasEstimate).toBe(true);
    expect(pack.estimate!.stages).toBe(2);
  });

  it("includes full estimate context for detail finance visibility", () => {
    const pack = buildAIProjectContext(seamForRole("owner", "detail"), BASE_INPUTS);
    expect(pack.estimate).not.toBeNull();
    expect(pack.estimate!.status).toBe("active");
  });
});

describe("buildAIProjectContext — tasks visibility", () => {
  it("includes tasks for viewer (contract: domains.tasks.per_role.viewer.domain_access = view)", () => {
    const pack = buildAIProjectContext(seamForRole("viewer"), BASE_INPUTS);
    expect(pack.tasks).toEqual({ total: 3, done: 1, blocked: 1 });
  });
});

// ---------------------------------------------------------------------------
// Contract path: no hidden financial data in context payload
// ---------------------------------------------------------------------------

describe("buildAIProjectContext — no forbidden financial keys in output", () => {
  it("viewer + none: context JSON contains no monetary field names from procurement/estimate", () => {
    const pack = buildAIProjectContext(seamForRole("viewer", "none"), BASE_INPUTS);
    const json = JSON.stringify(pack);
    expect(json).not.toContain("plannedBudgetCents");
    expect(json).not.toContain("spentCents");
    expect(json).not.toContain("toBePaidCents");
    expect(json).not.toContain("varianceCents");
    expect(json).not.toContain("percentProfitability");
    expect(json).not.toContain("orderedTotal");
    expect(json).not.toContain("inStockActualTotal");
  });

  it("contractor + none: same forbidden financial keys absent", () => {
    const pack = buildAIProjectContext(seamForRole("contractor", "none"), BASE_INPUTS);
    const json = JSON.stringify(pack);
    expect(json).not.toContain("plannedBudgetCents");
    expect(json).not.toContain("percentProfitability");
    expect(json).not.toContain("orderedTotal");
  });
});
