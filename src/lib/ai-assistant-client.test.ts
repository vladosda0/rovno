import { describe, expect, it } from "vitest";
import {
  shouldUseHostedInference,
  pickInferenceMode,
  mapGroundingStatus,
  mapGroundingSources,
  mapWorkProposal,
  mapInferenceResponse,
  buildInferenceRequestBody,
  sanitizeAiInferenceUserMessage,
  userVisibleLiveTextAssistantError,
} from "@/lib/ai-assistant-client";
import type { AIContextPack } from "@/lib/ai-project-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalContextPack(overrides?: Partial<AIContextPack>): AIContextPack {
  return {
    project: { title: "Test Project", type: "residential", progress: "40%" },
    stages: [],
    tasks: null,
    estimate: null,
    procurement: null,
    user: { role: "owner", credits: 100 },
    members: 2,
    recentEvents: [],
    _meta: { hiddenDomains: [] },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanitizeAiInferenceUserMessage
// ---------------------------------------------------------------------------

describe("sanitizeAiInferenceUserMessage", () => {
  it("maps provider invalid JSON to a friendly line", () => {
    expect(sanitizeAiInferenceUserMessage("AI provider returned invalid JSON content")).toBe(
      "The AI service had trouble formatting its reply. Please try again in a moment.",
    );
  });

  it("maps invalid provider log phrasing", () => {
    expect(sanitizeAiInferenceUserMessage("invalid provider payload")).toBe(
      "The AI service had trouble formatting its reply. Please try again in a moment.",
    );
  });

  it("passes through short permission-style errors", () => {
    expect(sanitizeAiInferenceUserMessage("Not allowed for this project.")).toBe("Not allowed for this project.");
  });

  it("replaces overly long raw messages", () => {
    const long = "x".repeat(500);
    expect(sanitizeAiInferenceUserMessage(long)).toBe(
      "The assistant could not complete this request. Please try again.",
    );
  });
});

// ---------------------------------------------------------------------------
// userVisibleLiveTextAssistantError
// ---------------------------------------------------------------------------

describe("userVisibleLiveTextAssistantError", () => {
  it("returns Error message when safe", () => {
    expect(userVisibleLiveTextAssistantError(new Error("Short backend reason."))).toBe("Short backend reason.");
  });

  it("hides non-Error throws", () => {
    expect(userVisibleLiveTextAssistantError("string")).toBe(
      "The assistant could not complete this request. Please try again.",
    );
  });

  it("hides stack-like messages", () => {
    expect(
      userVisibleLiveTextAssistantError(new Error("at foo (/src/bar.ts:1:2)")),
    ).toBe("The assistant could not complete this request. Please try again.");
  });
});

// ---------------------------------------------------------------------------
// shouldUseHostedInference
// ---------------------------------------------------------------------------

describe("shouldUseHostedInference", () => {
  it("returns true for supabase mode with UUID project id", () => {
    expect(shouldUseHostedInference("supabase", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(true);
  });

  it("returns false for demo mode", () => {
    expect(shouldUseHostedInference("demo", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(false);
  });

  it("returns false for local mode", () => {
    expect(shouldUseHostedInference("local", "a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(false);
  });

  it("returns false for supabase mode with non-UUID project id", () => {
    expect(shouldUseHostedInference("supabase", "project-a")).toBe(false);
  });

  it("returns false for supabase mode with empty project id", () => {
    expect(shouldUseHostedInference("supabase", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pickInferenceMode
// ---------------------------------------------------------------------------

describe("pickInferenceMode", () => {
  it("returns consult for consult_only regardless of message", () => {
    expect(pickInferenceMode("give me an estimate", "consult_only")).toBe("consult");
  });

  it("returns consult for ai_access none", () => {
    expect(pickInferenceMode("estimate scope", "none")).toBe("consult");
  });

  it("returns proposal for project_pool with proposal-intent keywords", () => {
    expect(pickInferenceMode("create an estimate for painting", "project_pool")).toBe("proposal");
    expect(pickInferenceMode("draft a scope of work", "project_pool")).toBe("proposal");
    expect(pickInferenceMode("budget for tiling", "project_pool")).toBe("proposal");
  });

  it("returns consult for project_pool without proposal-intent keywords", () => {
    expect(pickInferenceMode("what is the project status?", "project_pool")).toBe("consult");
  });
});

// ---------------------------------------------------------------------------
// mapGroundingStatus
// ---------------------------------------------------------------------------

describe("mapGroundingStatus", () => {
  it("maps client_attributed → project_context_grounded", () => {
    expect(mapGroundingStatus("client_attributed")).toBe("project_context_grounded");
  });

  it("maps partial_client_attributed → partial", () => {
    expect(mapGroundingStatus("partial_client_attributed")).toBe("partial");
  });

  it("maps none → ungrounded", () => {
    expect(mapGroundingStatus("none")).toBe("ungrounded");
  });

  it("falls back to ungrounded for undefined", () => {
    expect(mapGroundingStatus(undefined)).toBe("ungrounded");
  });

  it("falls back to ungrounded for unknown string", () => {
    expect(mapGroundingStatus("something_else")).toBe("ungrounded");
  });
});

// ---------------------------------------------------------------------------
// mapGroundingSources
// ---------------------------------------------------------------------------

describe("mapGroundingSources", () => {
  it("returns undefined for empty array", () => {
    expect(mapGroundingSources([])).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(mapGroundingSources(undefined)).toBeUndefined();
  });

  it("maps known kinds as-is", () => {
    const result = mapGroundingSources([
      { kind: "project_summary", label: "Project X" },
      { kind: "recent_activity", label: "3 events" },
    ]);
    expect(result).toEqual([
      { kind: "project_summary", label: "Project X" },
      { kind: "recent_activity", label: "3 events" },
    ]);
  });

  it("maps unknown kinds to other", () => {
    const result = mapGroundingSources([{ kind: "custom_thing", label: "Custom" }]);
    expect(result?.[0].kind).toBe("other");
  });

  it("uses fallback label when missing", () => {
    const result = mapGroundingSources([{ kind: "project_summary" }]);
    expect(result?.[0].label).toBe("Source");
  });
});

// ---------------------------------------------------------------------------
// mapWorkProposal
// ---------------------------------------------------------------------------

describe("mapWorkProposal", () => {
  it("returns undefined for null", () => {
    expect(mapWorkProposal(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(mapWorkProposal(undefined)).toBeUndefined();
  });

  it("returns undefined when title is missing", () => {
    expect(mapWorkProposal({ summary: "no title" })).toBeUndefined();
  });

  it("maps a full proposal", () => {
    const result = mapWorkProposal({
      title: "Renovation scope",
      summary: "Preliminary work items",
      steps: [
        { label: "Demolition", note: "Phase 1" },
        { label: "Framing" },
      ],
    });
    expect(result).toEqual({
      proposalTitle: "Renovation scope",
      proposalSummary: "Preliminary work items",
      suggestedWorkItems: [
        { label: "Demolition", note: "Phase 1" },
        { label: "Framing", note: undefined },
      ],
    });
  });

  it("handles missing steps array", () => {
    const result = mapWorkProposal({ title: "T", summary: "S" });
    expect(result?.suggestedWorkItems).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapInferenceResponse
// ---------------------------------------------------------------------------

describe("mapInferenceResponse", () => {
  it("maps a complete backend response", () => {
    const result = mapInferenceResponse({
      explanation: "Here is your answer.",
      groundingStatus: "client_attributed",
      groundingNote: "Grounded on project context.",
      groundingSources: [{ kind: "project_summary", label: "Proj A" }],
      workProposal: {
        title: "Draft scope",
        summary: "For discussion",
        steps: [{ label: "Step 1", note: "Do this" }],
      },
    });

    expect(result.explanation).toBe("Here is your answer.");
    expect(result.grounding).toBe("project_context_grounded");
    expect(result.groundingNote).toBe("Grounded on project context.");
    expect(result.sources).toEqual([{ kind: "project_summary", label: "Proj A" }]);
    expect(result.workProposal?.proposalTitle).toBe("Draft scope");
  });

  it("handles a minimal response (consult, no proposal)", () => {
    const result = mapInferenceResponse({
      explanation: "Short answer.",
      groundingStatus: "none",
    });

    expect(result.explanation).toBe("Short answer.");
    expect(result.grounding).toBe("ungrounded");
    expect(result.groundingNote).toBeUndefined();
    expect(result.sources).toBeUndefined();
    expect(result.workProposal).toBeUndefined();
  });

  it("provides fallback explanation when missing", () => {
    const result = mapInferenceResponse({});
    expect(result.explanation).toBe("The assistant returned an empty response.");
  });
});

// ---------------------------------------------------------------------------
// buildInferenceRequestBody
// ---------------------------------------------------------------------------

describe("buildInferenceRequestBody", () => {
  it("strips _meta from contextPack", () => {
    const pack = minimalContextPack({ _meta: { hiddenDomains: ["hr", "documents"] } });
    const body = buildInferenceRequestBody("pid-1", "consult", "hello", pack);
    const ctx = body.contextPack.projectContext as Record<string, unknown>;
    expect(ctx).not.toHaveProperty("_meta");
  });

  it("sends documentExcerpts as empty array", () => {
    const pack = minimalContextPack();
    const body = buildInferenceRequestBody("pid-1", "consult", "hello", pack);
    expect(body.contextPack.documentExcerpts).toEqual([]);
  });

  it("uses the provided mode", () => {
    const pack = minimalContextPack();
    expect(buildInferenceRequestBody("pid-1", "proposal", "draft", pack).mode).toBe("proposal");
    expect(buildInferenceRequestBody("pid-1", "consult", "help", pack).mode).toBe("consult");
  });

  it("uses message not userMessage for the backend field name", () => {
    const pack = minimalContextPack();
    const body = buildInferenceRequestBody("pid-1", "consult", "my question", pack);
    expect(body.message).toBe("my question");
    expect(body).not.toHaveProperty("userMessage");
  });

  it("preserves projectContext content", () => {
    const pack = minimalContextPack();
    const body = buildInferenceRequestBody("pid-1", "consult", "hi", pack);
    const ctx = body.contextPack.projectContext;
    expect(ctx).toHaveProperty("project");
    expect((ctx as { project: { title: string } }).project.title).toBe("Test Project");
  });
});
