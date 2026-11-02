import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import {
  homeAnswerId,
  readHomeAnswerRatings,
  sendAiAnswerRating,
  toggledRating,
  writeHomeAnswerRating,
} from "@/lib/ai-answer-rating";

describe("ai answer rating", () => {
  beforeEach(() => {
    rpc.mockReset();
    localStorage.clear();
  });

  it("sends up, down and null to the server under the contract's names", async () => {
    rpc.mockResolvedValue({ error: null });
    await sendAiAnswerRating({ messageId: "m1", rating: "good", projectId: null, question: "q", answer: "a" });
    await sendAiAnswerRating({ messageId: "m1", rating: "bad", projectId: "p", question: "q", answer: "a" });
    await sendAiAnswerRating({ messageId: "m1", rating: null, projectId: null, question: "q", answer: "a" });
    expect(rpc.mock.calls.map((call) => [call[0], call[1].p_rating, call[1].p_project_id])).toEqual([
      ["set_ai_answer_rating", "up", null],
      ["set_ai_answer_rating", "down", "p"],
      ["set_ai_answer_rating", null, null],
    ]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_message_id: "m1", p_question: "q", p_answer: "a" });
  });

  it("does not break the screen when the write fails", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    await expect(
      sendAiAnswerRating({ messageId: "m", rating: "good", projectId: null, question: "", answer: "a" }),
    ).resolves.toBe(false);
    rpc.mockResolvedValue({ error: { message: "denied" } });
    await expect(
      sendAiAnswerRating({ messageId: "m", rating: "good", projectId: null, question: "", answer: "a" }),
    ).resolves.toBe(false);
  });

  it("a second press of the same button takes the rating off", () => {
    expect(toggledRating(undefined, "good")).toBe("good");
    expect(toggledRating("good", "good")).toBeNull();
    expect(toggledRating("good", "bad")).toBe("bad");
  });

  it("gives a shared-conversation answer an id that only depends on its text", () => {
    expect(homeAnswerId("Уклон 0,5–1 %")).toBe(homeAnswerId("Уклон 0,5–1 %"));
    expect(homeAnswerId("Уклон 0,5–1 %")).not.toBe(homeAnswerId("Уклон 2 %"));
    expect(homeAnswerId("x").startsWith("home:")).toBe(true);
  });

  it("keeps the ratings outside a project per person, and removes one taken off", () => {
    writeHomeAnswerRating("me", "home:1", "good");
    writeHomeAnswerRating("me", "home:2", "bad");
    writeHomeAnswerRating("me", "home:1", null);
    expect(readHomeAnswerRatings("me")).toEqual({ "home:2": "bad" });
    expect(readHomeAnswerRatings("other")).toEqual({});
  });

  it("survives a browser that refuses storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readHomeAnswerRatings("me")).toEqual({});
    spy.mockRestore();
  });
});
