import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } },
}));

import { invokeAssistantOutsideProject, OUTSIDE_PROJECT_TIMEOUT_MS } from "@/lib/ai-assistant-client";

describe("invokeAssistantOutsideProject", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends no project, chat id or context pack", async () => {
    invokeMock.mockResolvedValue({ data: { answerText: "ok" }, error: null });
    await invokeAssistantOutsideProject({ userMessage: "уклон?" });
    const { body } = invokeMock.mock.calls[0][1];
    expect(body).toEqual({ mode: "consult", message: "уклон?", usageType: "chat" });
  });

  it("stops waiting after two minutes", async () => {
    invokeMock.mockImplementation(() => new Promise(() => {}));
    const call = invokeAssistantOutsideProject({ userMessage: "уклон?", aiOutputLanguage: "ru" });
    const settled = vi.fn();
    call.catch(settled);
    await vi.advanceTimersByTimeAsync(OUTSIDE_PROJECT_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(OUTSIDE_PROJECT_TIMEOUT_MS).toBe(120_000);
  });
});
