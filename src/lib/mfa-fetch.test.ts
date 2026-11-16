import { afterEach, describe, expect, it, vi } from "vitest";
import { MFA_REQUIRED_EVENT, mfaAwareFetch } from "@/lib/mfa-fetch";

const answer = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe("mfaAwareFetch", () => {
  const heard = vi.fn();
  window.addEventListener(MFA_REQUIRED_EVENT, heard);
  afterEach(() => heard.mockClear());

  it("hears a PostgREST refusal and one of our functions' refusals", async () => {
    await mfaAwareFetch(answer(403, { code: "42501", message: "mfa_required" }))("https://x.supabase.co/rest/v1/projects");
    await mfaAwareFetch(answer(403, { error: "mfa_required" }))("https://x.supabase.co/functions/v1/ai-inference");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("stays quiet for any other answer, and hands the response on untouched", async () => {
    await mfaAwareFetch(answer(403, { message: "permission denied" }))("https://x.supabase.co/rest/v1/projects");
    await mfaAwareFetch(answer(403, { error: "forbidden" }))("https://x.supabase.co/functions/v1/ai-inference");
    await mfaAwareFetch(answer(200, { message: "mfa_required" }))("https://x.supabase.co/rest/v1/projects");
    await mfaAwareFetch(answer(403, { error: "mfa_required" }))("https://x.supabase.co/auth/v1/user");
    const response = await mfaAwareFetch(answer(403, { error: "mfa_required" }))("https://x.supabase.co/functions/v1/f");
    expect(await response.json()).toEqual({ error: "mfa_required" });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
