import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import {
  exchangesToMessages,
  finishHomeExchange,
  homeTurnsToMessages,
  needsLaterHomeRead,
  readHomeAiChat,
  settleHomeExchanges,
  type HomeAiChatTurn,
  type HomeExchange,
} from "@/lib/home-ai-chat";
import { supabase } from "@/integrations/supabase/client";
import type { AIMessage } from "@/types/ai";

const turn = (role: "user" | "assistant", text: string): HomeAiChatTurn => ({ role, text });
const reply = (content: string): AIMessage => ({ id: `a-${content}`, role: "assistant", content, timestamp: "" });
const exchange = (id: string, content: string, extra: Partial<HomeExchange> = {}): HomeExchange => ({
  id,
  question: "q",
  timestamp: "",
  status: "done",
  answer: reply(content),
  finishedAt: 100,
  ...extra,
});

describe("homeTurnsToMessages", () => {
  it("carries the question to an answer that asked which project", () => {
    const messages = homeTurnsToMessages([turn("user", "смета?"), { role: "assistant", text: "x", needsProject: true }]);
    expect(messages[1].needsProjectQuestion).toBe("смета?");
  });
});

describe("settleHomeExchanges after a failure", () => {
  const failed = { id: "f", question: "вопрос", timestamp: "", status: "failed" as const, finishedAt: 100 };
  it("goes when the history ends on its question, the server answered late", () => {
    const turns = [{ role: "user" as const, text: "вопрос" }, { role: "assistant" as const, text: "ответ" }];
    expect(settleHomeExchanges([failed], turns, 200)).toEqual([]);
  });
  it("stays when the answer at the end is the one from before it, as after a failed regeneration", () => {
    const turns = [{ role: "user" as const, text: "вопрос" }, { role: "assistant" as const, text: "ответ" }];
    const retried = { ...failed, hideQuestion: true, lastAnswerAtSend: "ответ" };
    expect(settleHomeExchanges([retried], turns, 200)).toEqual([retried]);
  });
  it("stays when the history does not hold it", () => {
    const turns = [{ role: "user" as const, text: "другой" }, { role: "assistant" as const, text: "ответ" }];
    expect(settleHomeExchanges([failed], turns, 200)).toEqual([failed]);
    expect(settleHomeExchanges([failed], [], 200)).toEqual([failed]);
  });
  it("is not touched by a read begun before it finished", () => {
    const turns = [{ role: "user" as const, text: "вопрос" }];
    expect(settleHomeExchanges([failed], turns, 99)).toEqual([failed]);
  });
});

describe("readHomeAiChat", () => {
  it("stamps the read before the RPC goes out", async () => {
    const order: string[] = [];
    vi.spyOn(performance, "now").mockImplementation(() => {
      order.push("stamp");
      return 5;
    });
    vi.mocked(supabase.rpc).mockImplementation((() => {
      order.push("rpc");
      return Promise.resolve({ data: null, error: null });
    }) as never);
    await expect(readHomeAiChat()).resolves.toEqual({ startedAt: 5, turns: [] });
    expect(order.slice(0, 2)).toEqual(["stamp", "rpc"]);
    vi.restoreAllMocks();
  });
});

describe("needsLaterHomeRead", () => {
  const done = { id: "d", question: "в", timestamp: "", status: "done" as const, finishedAt: 100 };
  it("asks for another read when this one began before the finish", () => {
    expect(needsLaterHomeRead([done], 99)).toBe(true);
    expect(needsLaterHomeRead([done], 100)).toBe(false);
    expect(needsLaterHomeRead([{ ...done, finishedAt: undefined, status: "pending" }], 99)).toBe(false);
  });
});

describe("settleHomeExchanges", () => {
  const history = [turn("user", "q"), turn("assistant", "a")];

  it("takes a finished exchange off once a newer read holds it", () => {
    expect(settleHomeExchanges([exchange("1", "a")], history, 100)).toEqual([]);
  });

  it("waits for a read taken after it finished", () => {
    const pending = [exchange("1", "a")];
    expect(settleHomeExchanges(pending, history, 99)).toEqual(pending);
  });

  it("keeps an answer the server did not write", () => {
    const privacy = [exchange("1", "короткий путь")];
    expect(settleHomeExchanges(privacy, history, 200)).toEqual(privacy);
  });

  it("does not depend on where the bot wrote: a bot's turns after it change nothing", () => {
    const withBot = [...history, turn("user", "tg"), turn("assistant", "tga")];
    expect(settleHomeExchanges([exchange("1", "a")], withBot, 200)).toEqual([]);
  });

  it("leaves a pending exchange and a failure the history does not hold", () => {
    const rest = [exchange("1", "сбой", { status: "failed", question: "другой вопрос" }), exchange("2", "a", { status: "pending", answer: undefined, finishedAt: undefined })];
    expect(settleHomeExchanges(rest, history, 200)).toEqual(rest);
  });
});

describe("finishHomeExchange", () => {
  it("closes the failures before it", () => {
    const failed = exchange("1", "сбой", { status: "failed" });
    const next = exchange("2", "", { status: "pending", answer: undefined, finishedAt: undefined });
    const result = finishHomeExchange([failed, next], "2", reply("ok"), 300);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "2", status: "done", finishedAt: 300 });
  });
});

describe("exchangesToMessages", () => {
  it("does not draw a regeneration's question", () => {
    const messages = exchangesToMessages([exchange("1", "a"), exchange("2", "b", { hideQuestion: true })]);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "assistant"]);
  });
});
