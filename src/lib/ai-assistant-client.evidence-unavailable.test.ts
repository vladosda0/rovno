import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import {
  invokeLiveTextAssistant,
  isRetryableAiInferenceFailure,
  sanitizeAiInferenceUserMessage,
} from "@/lib/ai-assistant-client";
import type { AIContextPack } from "@/lib/ai-project-context";

const contextPack = {
  project: { title: "Test Project", type: "residential", progress: "40%" },
  stages: [], tasks: null, estimate: null, procurement: null,
  user: { role: "owner" }, members: 2, recentEvents: [], _meta: { hiddenDomains: [] },
} as AIContextPack;

const RU_MESSAGE = "Не удалось загрузить данные проекта, поэтому ассистент не ответил. Попробуйте ещё раз.";

const httpError = (body: string, status: number, statusText?: string) => ({
  data: null,
  error: { message: "Edge Function returned a non-2xx status code", context: new Response(body, { status, statusText }) },
});

function send(userMessage = "what is left on stage 2?") {
  return invokeLiveTextAssistant({
    projectId: "4b8d8f0e-2f7a-4c55-9a43-1f3a4f9f0c11",
    contextPack,
    userMessage,
    workspaceKind: "supabase",
    aiAccess: "consult_only",
    aiOutputLanguage: "ru",
  });
}

const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(() => { throw new Error("expected the call to fail"); }, (err: unknown) => err);

describe("evidence_unavailable from ai-inference", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("maps the code to a project-data message in both languages", () => {
    expect(sanitizeAiInferenceUserMessage("evidence_unavailable", "ru")).toBe(RU_MESSAGE);
    expect(sanitizeAiInferenceUserMessage("evidence_unavailable", "en"))
      .toBe("The project data could not be loaded, so the assistant did not answer. Please try again.");
  });

  it("is retryable when the code comes back in an error response body", async () => {
    invokeMock.mockResolvedValue(httpError(JSON.stringify({ error: "evidence_unavailable" }), 503));
    const err = await failureOf(send());
    expect(isRetryableAiInferenceFailure(err)).toBe(true);
    expect((err as Error).message).toBe(RU_MESSAGE);
  });

  it("is retryable when the code comes back in a 200 body", async () => {
    invokeMock.mockResolvedValue({ data: { error: "evidence_unavailable" }, error: null });
    expect(isRetryableAiInferenceFailure(await failureOf(send()))).toBe(true);
  });

  it("is not retryable for any other failure", async () => {
    invokeMock.mockResolvedValue({ data: { error: "quota_exceeded" }, error: null });
    expect(isRetryableAiInferenceFailure(await failureOf(send()))).toBe(false);

    invokeMock.mockResolvedValue(httpError(JSON.stringify({ error: "Not allowed for this project." }), 403));
    expect(isRetryableAiInferenceFailure(await failureOf(send()))).toBe(false);

    invokeMock.mockResolvedValue(httpError("", 502, "Bad Gateway"));
    expect(isRetryableAiInferenceFailure(await failureOf(send()))).toBe(false);

    expect(isRetryableAiInferenceFailure(new Error("evidence_unavailable"))).toBe(false);
  });
});
