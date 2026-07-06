import { describe, it, expect } from "vitest";
import { resolveAiChatKey, uuidV5 } from "./ai-chat-key";

describe("ai-chat-key", () => {
  it("uuidV5 matches RFC 4122 Appendix B reference vector", async () => {
    // The same vector that validated the SQL helper public._ai_chat_key_uuid_v5
    // during the P0 audit. If web, bot, and SQL ever disagree on this, the
    // user's cross-channel memory silently splits.
    const result = await uuidV5(
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "www.example.org",
    );
    expect(result).toBe("74738ff5-5367-5958-9aee-98fffdcd1876");
  });

  it("resolveAiChatKey matches the value SQL returned on staging", async () => {
    // Recorded from staging on 2026-05-14 via mcp execute_sql:
    //   select public.resolve_ai_chat_key(
    //     '8dad1741-7d55-445f-9588-7c29726b4e90',
    //     'b1ce0001-0000-4000-9000-000000000000'
    //   );
    // => b5d301f6-76a2-5779-8c72-295cd4eed9a0
    const result = await resolveAiChatKey(
      "8dad1741-7d55-445f-9588-7c29726b4e90",
      "b1ce0001-0000-4000-9000-000000000000",
    );
    expect(result).toBe("b5d301f6-76a2-5779-8c72-295cd4eed9a0");
  });

  it("resolveAiChatKey is deterministic for the same (profile, project)", async () => {
    const a = await resolveAiChatKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    const b = await resolveAiChatKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(a).toBe(b);
  });

  it("resolveAiChatKey differs when profile or project changes", async () => {
    const base = await resolveAiChatKey(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    const otherProfile = await resolveAiChatKey(
      "33333333-3333-4333-8333-333333333333",
      "22222222-2222-4222-8222-222222222222",
    );
    const otherProject = await resolveAiChatKey(
      "11111111-1111-4111-8111-111111111111",
      "44444444-4444-4444-8444-444444444444",
    );
    expect(base).not.toBe(otherProfile);
    expect(base).not.toBe(otherProject);
  });

  it("uuidV5 throws on malformed namespace input", async () => {
    await expect(uuidV5("not-a-uuid", "name")).rejects.toThrow(/invalid uuid/);
  });
});
