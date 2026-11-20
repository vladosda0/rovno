import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { registerPasskeyMock, signInWithPasskeyMock, updateMock, deleteMock, listMock, rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  registerPasskeyMock: vi.fn(),
  signInWithPasskeyMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      registerPasskey: registerPasskeyMock,
      signInWithPasskey: signInWithPasskeyMock,
      passkey: { update: updateMock, delete: deleteMock, list: listMock },
    },
    rpc: rpcMock,
  },
}));

import {
  __setLastCredentialForTests,
  classifySetupError,
  classifySignInError,
  declinePasskeyOffer,
  forgetMissingPasskeys,
  passkeyOfferPaused,
  passkeysSetUpHere,
  passkeySupported,
  runPasskeySignIn,
  setUpPasskeyHere,
  turnOffPasskey,
  passkeyKnownHere,
} from "@/lib/passkey";

const UA_YANDEX =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/24.10.0.0 Safari/537.36";

function stubPublicKeyCredential(extra: Record<string, unknown> = {}) {
  const signalUnknownCredential = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("PublicKeyCredential", { signalUnknownCredential, ...extra });
  return { signalUnknownCredential };
}

describe("passkey", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    __setLastCredentialForTests(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is supported only where the browser has PublicKeyCredential", () => {
    expect(passkeySupported()).toBe(false);
    stubPublicKeyCredential();
    expect(passkeySupported()).toBe(true);
  });

  it("sets up, renames an unknown store to «browser · system» and remembers it as this browser's", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(UA_YANDEX);
    registerPasskeyMock.mockResolvedValue({ data: { id: "pk-1", friendly_name: "Passkey", created_at: "2026-11-20T10:00:00Z" }, error: null });
    updateMock.mockResolvedValue({ data: {}, error: null });

    const outcome = await setUpPasskeyHere("u1");

    expect(updateMock).toHaveBeenCalledWith({ passkeyId: "pk-1", friendlyName: "Яндекс Браузер · Windows" });
    expect(outcome).toEqual({ kind: "ok", passkey: expect.objectContaining({ id: "pk-1", friendly_name: "Яндекс Браузер · Windows" }) });
    expect(passkeysSetUpHere("u1")).toEqual(["pk-1"]);
    expect(passkeysSetUpHere("u2")).toEqual([]);
  });

  it("keeps a name Auth knows", async () => {
    registerPasskeyMock.mockResolvedValue({ data: { id: "pk-2", friendly_name: "Apple Passwords", created_at: "x" }, error: null });
    await setUpPasskeyHere("u1");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("names the refusals of the setup", async () => {
    expect(classifySetupError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe("exists");
    expect(classifySetupError({ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" })).toBe("cancel");
    expect(classifySetupError({ code: "ERROR_CEREMONY_ABORTED" })).toBe("cancel");
    expect(classifySetupError({ code: "insufficient_aal", status: 403 })).toBe("needs_code");
    expect(classifySetupError({ code: "unexpected_failure", status: 500 })).toBe("failed");
    registerPasskeyMock.mockResolvedValue({ data: null, error: { code: "insufficient_aal", status: 403 } });
    expect(await setUpPasskeyHere("u1")).toEqual({ kind: "error", error: "needs_code" });
  });

  it("a browser that already holds this person's credential is remembered, so it is not offered again", async () => {
    registerPasskeyMock.mockResolvedValue({ data: null, error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" } });
    expect(passkeyKnownHere("u1")).toBe(false);
    expect(await setUpPasskeyHere("u1")).toEqual({ kind: "error", error: "exists" });
    expect(passkeyKnownHere("u1")).toBe(true);
    expect(passkeyKnownHere("u2")).toBe(false);
  });

  it("turning off a device keeps the «already here» note of every person", async () => {
    registerPasskeyMock.mockResolvedValue({ data: null, error: { code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" } });
    await setUpPasskeyHere("u1");
    deleteMock.mockResolvedValue({ data: null, error: null });
    await turnOffPasskey("pk-any");
    expect(passkeyKnownHere("u1")).toBe(true);
  });

  it("forgets local notes of devices no longer in the list", async () => {
    registerPasskeyMock.mockResolvedValue({ data: { id: "pk-1", friendly_name: "Apple Passwords", created_at: "x" }, error: null });
    await setUpPasskeyHere("u1");
    forgetMissingPasskeys("u1", []);
    expect(passkeysSetUpHere("u1")).toEqual([]);
  });

  it("turning off a device set up here tells the browser it is gone, and later recognises it", async () => {
    const { signalUnknownCredential } = stubPublicKeyCredential();
    registerPasskeyMock.mockImplementation(async () => {
      __setLastCredentialForTests({ kind: "create", credentialId: "cred-1", rpId: "rovno.ai", at: Date.now() });
      return { data: { id: "pk-1", friendly_name: "Apple Passwords", created_at: "x" }, error: null };
    });
    await setUpPasskeyHere("u1");
    deleteMock.mockResolvedValue({ data: null, error: null });

    expect(await turnOffPasskey("pk-1")).toBe("ok");
    expect(signalUnknownCredential).toHaveBeenCalledWith({ rpId: "rovno.ai", credentialId: "cred-1" });
    expect(passkeysSetUpHere("u1")).toEqual([]);
    rpcMock.mockResolvedValue({ data: null, error: { message: "function not found" } });
    expect(await classifySignInError({ code: "webauthn_verification_failed" }, "cred-1")).toBe("gone");
    expect(await classifySignInError({ code: "webauthn_verification_failed" }, "cred-other")).toBe("failed");
  });

  it("turning off without the second step asks for the code", async () => {
    deleteMock.mockResolvedValue({ data: null, error: { code: "insufficient_aal", status: 403 } });
    expect(await turnOffPasskey("pk-1")).toBe("needs_code");
  });

  describe("sign-in", () => {
    it("signs in", async () => {
      const user = { id: "u1" };
      signInWithPasskeyMock.mockResolvedValue({ data: { session: { user }, user }, error: null });
      const controller = new AbortController();
      expect(await runPasskeySignIn({ signal: controller.signal, conditional: false })).toEqual({ kind: "ok", user });
      expect(signInWithPasskeyMock).toHaveBeenCalledWith({ options: { signal: controller.signal } });
    });

    it("asks the browser for the suggestion in the Email field when conditional", async () => {
      signInWithPasskeyMock.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } });
      const controller = new AbortController();
      await runPasskeySignIn({ signal: controller.signal, conditional: true });
      expect(signInWithPasskeyMock).toHaveBeenCalledWith({ options: { signal: controller.signal, mediation: "conditional" } });
    });

    it("a closed window or expired time is the «not finished» plaque; silent in the background", async () => {
      signInWithPasskeyMock.mockResolvedValue({ data: null, error: { code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", name: "WebAuthnError" } });
      expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "cancel" });
      expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: true })).toEqual({ kind: "silent" });
    });

    it("an aborted request is never shown", async () => {
      const controller = new AbortController();
      signInWithPasskeyMock.mockImplementation(async () => {
        controller.abort();
        return { data: null, error: { code: "ERROR_CEREMONY_ABORTED" } };
      });
      expect(await runPasskeySignIn({ signal: controller.signal, conditional: false })).toEqual({ kind: "silent" });
    });

    it("Auth's refusal of a picked device shows the check plaque even in the background", async () => {
      signInWithPasskeyMock.mockResolvedValue({ data: null, error: { code: "webauthn_verification_failed", status: 400 } });
      expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: true })).toEqual({ kind: "alert", alert: "failed" });
    });

    it("a device Auth says is unknown: the «turned off» plaque and the browser is told", async () => {
      const { signalUnknownCredential } = stubPublicKeyCredential();
      signInWithPasskeyMock.mockImplementation(async () => {
        __setLastCredentialForTests({ kind: "get", credentialId: "cred-9", rpId: "rovno.ai", at: Date.now() });
        return { data: null, error: { code: "webauthn_credential_not_found", status: 404 } };
      });
      expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "gone" });
      expect(signalUnknownCredential).toHaveBeenCalledWith({ rpId: "rovno.ai", credentialId: "cred-9" });
    });

    describe("«webauthn_verification_failed»: turned off or a failed check (rovno-db passkey_credential_known)", () => {
      function refusedWith(credentialId: string) {
        signInWithPasskeyMock.mockImplementation(async () => {
          __setLastCredentialForTests({ kind: "get", credentialId, rpId: "rovno.ai", at: Date.now() });
          return { data: null, error: { code: "webauthn_verification_failed", status: 400 } };
        });
      }

      it("unknown to the database: «turned off» and the browser is told", async () => {
        const { signalUnknownCredential } = stubPublicKeyCredential();
        refusedWith("cred-gone");
        rpcMock.mockResolvedValue({ data: false, error: null });
        expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "gone" });
        expect(rpcMock).toHaveBeenCalledWith("passkey_credential_known", { p_credential_id: "cred-gone" });
        expect(signalUnknownCredential).toHaveBeenCalledWith({ rpId: "rovno.ai", credentialId: "cred-gone" });
      });

      it.each([
        ["still known", { data: true, error: null }],
        ["the check failed", { data: null, error: { message: "boom" } }],
      ])("%s: «couldn't verify», and the live device is never erased", async (_label, answer) => {
        const { signalUnknownCredential } = stubPublicKeyCredential();
        refusedWith("cred-live");
        rpcMock.mockResolvedValue(answer);
        expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "failed" });
        expect(signalUnknownCredential).not.toHaveBeenCalled();
      });

      it("no credential id seen: «couldn't verify» without asking", async () => {
        signInWithPasskeyMock.mockResolvedValue({ data: null, error: { code: "webauthn_verification_failed", status: 400 } });
        expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "failed" });
        expect(rpcMock).not.toHaveBeenCalled();
      });
    });

    it("a thrown error from the SDK becomes the «not finished» plaque", async () => {
      signInWithPasskeyMock.mockRejectedValue(new Error("network"));
      expect(await runPasskeySignIn({ signal: new AbortController().signal, conditional: false })).toEqual({ kind: "alert", alert: "cancel" });
    });
  });

  describe("«Не сейчас»", () => {
    it("pauses the offer for 30 days, and after the third time for good", () => {
      const now = Date.UTC(2026, 10, 20);
      expect(passkeyOfferPaused(now)).toBe(false);
      declinePasskeyOffer(now);
      expect(passkeyOfferPaused(now + 29 * 86_400_000)).toBe(true);
      expect(passkeyOfferPaused(now + 31 * 86_400_000)).toBe(false);
      declinePasskeyOffer(now + 31 * 86_400_000);
      declinePasskeyOffer(now + 62 * 86_400_000);
      expect(passkeyOfferPaused(now + 400 * 86_400_000)).toBe(true);
    });
  });
});
