import { afterEach, describe, expect, it } from "vitest";
import { getOrCreateProjectChatSessionId } from "@/lib/ai-project-chat-session";

describe("getOrCreateProjectChatSessionId", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("returns undefined for empty project id", () => {
    expect(getOrCreateProjectChatSessionId("  ")).toBeUndefined();
  });

  it("creates and reuses a UUID scoped to the project", () => {
    const pid = "proj-1";
    const a = getOrCreateProjectChatSessionId(pid);
    const b = getOrCreateProjectChatSessionId(pid);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
    expect(a).toBe(b);
    expect(sessionStorage.getItem(`rovno:ai-chat:${pid}`)).toBe(a);
  });

  it("uses distinct ids per project", () => {
    const x = getOrCreateProjectChatSessionId("p-a")!;
    const y = getOrCreateProjectChatSessionId("p-b")!;
    expect(x).not.toBe(y);
  });
});
