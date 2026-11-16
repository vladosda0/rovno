import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {}, functions: {} } }));

import { aalOfToken, groupKey, isMfaFreePath, mfaNext, mfaPathFor, recoveryCodesFile } from "@/lib/mfa";
import { MFA_REQUIRED_EVENT, mfaAwareFetch } from "@/lib/mfa-fetch";
import { normalizeAppCode } from "@/lib/app-code";

describe("mfa helpers", () => {
  it("lets only sign-in and the static legal pages open without the second step, in any letter case", () => {
    for (const path of ["/auth/login", "/auth/mfa", "/auth/vk/callback", "/AUTH/Login", "/privacy", "/offer", "/Privacy", "/refund/", "/contacts", "/theme"]) {
      expect(isMfaFreePath(path), path).toBe(true);
    }
    // These read data through the person's session, which the server refuses until the second step.
    for (const path of ["/", "/home", "/project/1/estimate", "/settings", "/onboarding", "/invite/accept/x", "/billing/checkout", "/blog", "/blog/some-post", "/blog/admin", "/blog/Admin", "/baza/snip", "/share/report/t", "/promo/redeem"]) {
      expect(isMfaFreePath(path), path).toBe(false);
    }
  });

  it("reads the aal of a token and gives null for anything else", () => {
    const token = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}.s`;
    expect(aalOfToken(token({ aal: "aal2", sub: "u1" }))).toBe("aal2");
    expect(aalOfToken(token({ sub: "u1" }))).toBeNull();
    expect(aalOfToken("not-a-jwt")).toBeNull();
    expect(aalOfToken(undefined)).toBeNull();
  });

  it("sends back only inside the site and never into the code screen again", () => {
    expect(mfaNext("/project/1?tab=docs")).toBe("/project/1?tab=docs");
    expect(mfaNext("//evil.example")).toBe("/home");
    expect(mfaNext("https://evil.example")).toBe("/home");
    expect(mfaNext("/auth/mfa?next=/home")).toBe("/home");
    expect(mfaNext(null)).toBe("/home");
    expect(mfaPathFor("/project/1?tab=docs")).toBe("/auth/mfa?next=%2Fproject%2F1%3Ftab%3Ddocs");
  });

  it("shows the key in groups of four and the codes file names the account", () => {
    expect(groupKey("JBSWY3DPEHPK3PXP7QF2MZ4KR6TNWB3D")).toBe("JBSW Y3DP EHPK 3PXP 7QF2 MZ4K R6TN WB3D");
    const file = recoveryCodesFile(["aaaaa-bbbbb", "ccccc-ddddd"], "ivan@yandex.ru");
    expect(file).toContain("Коды восстановления Rovno для ivan@yandex.ru");
    expect(file).toContain("aaaaa-bbbbb\nccccc-ddddd\n");
  });

  it("takes six digits out of a pasted code with a space or a dash", () => {
    expect(normalizeAppCode("482 913")).toBe("482913");
    expect(normalizeAppCode("482-913")).toBe("482913");
    expect(normalizeAppCode("4829137")).toBe("482913");
  });
});

describe("mfaAwareFetch", () => {
  afterEach(() => vi.restoreAllMocks());

  const respond = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("tells the app when PostgREST asks for the second step, and still returns the response", async () => {
    const heard = vi.fn();
    window.addEventListener(MFA_REQUIRED_EVENT, heard);
    const res = await mfaAwareFetch(respond(403, { code: "42501", message: "mfa_required" }) as unknown as typeof fetch)("https://x.supabase.co/rest/v1/projects");
    window.removeEventListener(MFA_REQUIRED_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe("mfa_required");
  });

  it("stays quiet for other refusals and other services", async () => {
    const heard = vi.fn();
    window.addEventListener(MFA_REQUIRED_EVENT, heard);
    await mfaAwareFetch(respond(403, { code: "42501", message: "permission denied" }) as unknown as typeof fetch)("https://x.supabase.co/rest/v1/projects");
    await mfaAwareFetch(respond(403, { message: "mfa_required" }) as unknown as typeof fetch)("https://x.supabase.co/functions/v1/ai-inference");
    window.removeEventListener(MFA_REQUIRED_EVENT, heard);
    expect(heard).not.toHaveBeenCalled();
  });
});
