/**
 * «Вход по лицу или отпечатку» (epic external-login, slice 5). Technically a passkey: Auth
 * (GoTrue) owns registration, sign-in and the list; this module is the one place the app talks
 * to it, shared by the sign-in page, «Безопасность» and «Входите быстрее», so the setup path is
 * one and the same everywhere. The word «ключ» stays in code: on screen it is «вход по лицу
 * или отпечатку» (Vlad 2026-11-16).
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AUTH_DEFAULT_PASSKEY_NAME, deviceLabelFromUserAgent } from "@/lib/passkey-names";

export interface PasskeyItem {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}

/* ---------- what the browser can do ---------- */

type PublicKeyCredentialStatic = {
  isConditionalMediationAvailable?: () => Promise<boolean>;
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  signalUnknownCredential?: (options: { rpId: string; credentialId: string }) => Promise<void>;
};

function publicKeyCredential(): PublicKeyCredentialStatic | null {
  if (typeof window === "undefined") return null;
  const value = (window as unknown as { PublicKeyCredential?: PublicKeyCredentialStatic }).PublicKeyCredential;
  return value ?? null;
}

/** False only in a browser with no WebAuthn at all: then the button and the setup are hidden. */
export function passkeySupported(): boolean {
  return publicKeyCredential() !== null;
}

/** The browser can offer the sign-in in the Email field's suggestions. */
export async function conditionalMediationAvailable(): Promise<boolean> {
  try {
    return (await publicKeyCredential()?.isConditionalMediationAvailable?.()) === true;
  } catch {
    return false;
  }
}

/** The device itself unlocks with a face, a fingerprint or a PIN (for «Входите быстрее»). */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    return (await publicKeyCredential()?.isUserVerifyingPlatformAuthenticatorAvailable?.()) === true;
  } catch {
    return false;
  }
}

/* ---------- which credential the browser answered with ---------- */

interface SeenCredential {
  kind: "create" | "get";
  credentialId: string;
  rpId: string;
  at: number;
}

let lastCredential: SeenCredential | null = null;
let recorderInstalled = false;

/**
 * Auth's list gives its own ids, not the WebAuthn credential id, and the SDK keeps the
 * credential to itself. The credential id is needed for one thing: to tell this browser, after
 * a device is turned off here, that the credential is gone (Signal API), and to recognise it
 * when it is offered again. So the answers of navigator.credentials are noted on the way past,
 * unchanged. Installed once; where the browser refuses, nothing is noted.
 */
function installCredentialRecorder(): void {
  if (recorderInstalled || typeof navigator === "undefined" || !navigator.credentials) return;
  recorderInstalled = true;
  try {
    const container = navigator.credentials;
    const create = container.create.bind(container);
    const get = container.get.bind(container);
    const host = () => (typeof window !== "undefined" ? window.location.hostname : "");
    container.create = async (options?: CredentialCreationOptions) => {
      const credential = await create(options);
      if (credential && options?.publicKey) {
        lastCredential = { kind: "create", credentialId: credential.id, rpId: options.publicKey.rp?.id ?? host(), at: Date.now() };
      }
      return credential;
    };
    container.get = async (options?: CredentialRequestOptions) => {
      const credential = await get(options);
      if (credential && options?.publicKey) {
        lastCredential = { kind: "get", credentialId: credential.id, rpId: options.publicKey.rpId ?? host(), at: Date.now() };
      }
      return credential;
    };
  } catch {
    // a browser that does not let the methods be wrapped: Signal API stays off, sign-in works
  }
}

function credentialSince(kind: SeenCredential["kind"], since: number): SeenCredential | null {
  return lastCredential && lastCredential.kind === kind && lastCredential.at >= since ? lastCredential : null;
}


/** Tests only. */
export function __setLastCredentialForTests(value: SeenCredential | null): void {
  lastCredential = value;
}

function signalUnknown(rpId: string, credentialId: string): void {
  try {
    void publicKeyCredential()?.signalUnknownCredential?.({ rpId, credentialId })?.catch(() => undefined);
  } catch {
    // older browser: the text asks the person to remove it in «Пароли»
  }
}

/* ---------- what this browser remembers ---------- */

const STORE_KEY = "rovno.passkeys.v1";
const GONE_LIMIT = 20;

interface HereEntry {
  userId: string;
  passkeyId: string;
  credentialId?: string;
  rpId?: string;
}

interface PasskeyStore {
  here: HereEntry[];
  /** People for whom this browser already holds a credential set up elsewhere (synced). */
  known?: string[];
  gone: Array<{ credentialId: string; rpId?: string }>;
}

function readStore(): PasskeyStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    return {
      here: Array.isArray(parsed?.here) ? parsed.here : [],
      gone: Array.isArray(parsed?.gone) ? parsed.gone : [],
      known: Array.isArray(parsed?.known) ? parsed.known.filter((v: unknown) => typeof v === "string") : [],
    };
  } catch {
    return { here: [], gone: [] };
  }
}

function writeStore(store: PasskeyStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // private window or blocked storage: the label «Этот браузер» is simply not shown
  }
}

/** The browser refused a second credential for this person: it already holds one. */
export function rememberKnownHere(userId: string): void {
  const store = readStore();
  if ((store.known ?? []).includes(userId)) return;
  writeStore({ ...store, known: [...(store.known ?? []), userId].slice(-20) });
}

/** Whether this browser is known to hold a credential of this person already. */
export function passkeyKnownHere(userId: string): boolean {
  return (readStore().known ?? []).includes(userId);
}

/** Ids of the passkeys this person set up in this browser («Этот браузер»). */
export function passkeysSetUpHere(userId: string): string[] {
  return readStore().here.filter((e) => e.userId === userId).map((e) => e.passkeyId);
}

/** Drops the local notes of passkeys that are no longer in the person's list. */
export function forgetMissingPasskeys(userId: string, existingIds: string[]): void {
  const store = readStore();
  const here = store.here.filter((e) => e.userId !== userId || existingIds.includes(e.passkeyId));
  if (here.length !== store.here.length) writeStore({ ...store, here });
}

function rememberHere(entry: HereEntry): void {
  const store = readStore();
  writeStore({ ...store, here: [...store.here.filter((e) => e.passkeyId !== entry.passkeyId), entry] });
}

function rememberGone(passkeyId: string): HereEntry | null {
  const store = readStore();
  const entry = store.here.find((e) => e.passkeyId === passkeyId) ?? null;
  const gone = entry?.credentialId ? [...store.gone, { credentialId: entry.credentialId, rpId: entry.rpId }].slice(-GONE_LIMIT) : store.gone;
  writeStore({ ...store, here: store.here.filter((e) => e.passkeyId !== passkeyId), gone });
  return entry;
}

function wasTurnedOffHere(credentialId: string | undefined): boolean {
  return !!credentialId && readStore().gone.some((g) => g.credentialId === credentialId);
}

/* ---------- errors ---------- */

function codeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

/** The browser's side (window closed, time ran out, an aborted request), not Auth's answer. */
function isCeremonyError(error: unknown): boolean {
  const code = codeOf(error);
  if (code.startsWith("ERROR_")) return true;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && /WebAuthn|ceremony/i.test(message) && !code;
}

/** The plaques of mockup frame 4. */
export type PasskeySignInAlert = "cancel" | "gone" | "failed";

/**
 * Auth 2.197 answers both an unknown (turned off) credential and a failed check with
 * `webauthn_verification_failed` and the same text (measured on the stand 2026-11-20). Which
 * one it was is asked from rovno-db by the credential id the browser answered with
 * (`passkey_credential_known`, callable without a session): `false` means turned off. Only a
 * definite `false`, or a credential this browser itself turned off, counts as «gone»; `true`, an
 * error or no answer is «failed», so a live device (the iCloud check error, supabase/auth#2732)
 * is never reported to the browser as unknown and erased.
 */
export async function classifySignInError(error: unknown, credentialId?: string): Promise<PasskeySignInAlert> {
  const code = codeOf(error);
  if (code === "webauthn_credential_not_found" || code === "passkey_not_found") return "gone";
  if (code !== "webauthn_verification_failed") return "cancel";
  if (!credentialId) return "failed";
  const known = await credentialKnown(credentialId);
  if (known === false) return "gone";
  if (known === null && wasTurnedOffHere(credentialId)) return "gone";
  return "failed";
}

/** rovno-db `passkey_credential_known`; null when it cannot be told (no function yet, network). */
async function credentialKnown(credentialId: string): Promise<boolean | null> {
  try {
    const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
      "passkey_credential_known",
      { p_credential_id: credentialId },
    );
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

export type PasskeySetupError = "cancel" | "exists" | "needs_code" | "failed";

export function classifySetupError(error: unknown): PasskeySetupError {
  const code = codeOf(error);
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") return "exists";
  if (code === "insufficient_aal") return "needs_code";
  if (code === "webauthn_challenge_expired" || isCeremonyError(error)) return "cancel";
  return "failed";
}

/* ---------- sign-in ---------- */

export type PasskeySignInOutcome =
  | { kind: "ok"; user: User }
  | { kind: "alert"; alert: PasskeySignInAlert }
  | { kind: "silent"; renew?: boolean };

/**
 * One sign-in attempt. `conditional` is the quiet request behind the Email field's
 * suggestions: it stays pending until the person picks the entry, and its own failures (the
 * server not offering this sign-in, a cancelled or expired request) are never shown; only a
 * picked credential that Auth refuses gets a plaque. An aborted request is always silent.
 */
export async function runPasskeySignIn({ signal, conditional }: { signal: AbortSignal; conditional: boolean }): Promise<PasskeySignInOutcome> {
  installCredentialRecorder();
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.auth.signInWithPasskey({
      options: conditional ? { signal, mediation: "conditional" } : { signal },
    });
    const user = data?.session?.user ?? data?.user ?? null;
    if (!error && data?.session && user) return { kind: "ok", user };
    if (signal.aborted) return { kind: "silent" };
    const seen = credentialSince("get", startedAt);
    const alert = await classifySignInError(error, seen?.credentialId);
    if (alert === "gone" && seen) signalUnknown(seen.rpId, seen.credentialId);
    // The quiet request outlived Auth's five-minute challenge: a fresh one, without a word.
    if (conditional && codeOf(error) === "webauthn_challenge_expired") return { kind: "silent", renew: true };
    if (conditional && alert === "cancel") return { kind: "silent" };
    return { kind: "alert", alert };
  } catch {
    return signal.aborted || conditional ? { kind: "silent" } : { kind: "alert", alert: "cancel" };
  }
}

/* ---------- setup and management ---------- */

export type PasskeySetupOutcome = { kind: "ok"; passkey: PasskeyItem } | { kind: "error"; error: PasskeySetupError };

/**
 * «Настроить на этом устройстве» and «Настроить» on «Входите быстрее»: the browser window,
 * then, when Auth did not know the store (`Passkey`), the name «браузер · система» right away.
 * A failed rename leaves Auth's name; the list shows it as «Устройство».
 */
export async function setUpPasskeyHere(userId: string): Promise<PasskeySetupOutcome> {
  installCredentialRecorder();
  const startedAt = Date.now();
  try {
    const { data, error } = await supabase.auth.registerPasskey();
    if (error || !data) {
      const kind = classifySetupError(error);
      if (kind === "exists") rememberKnownHere(userId);
      return { kind: "error", error: kind };
    }
    const seen = credentialSince("create", startedAt);
    rememberHere({ userId, passkeyId: data.id, credentialId: seen?.credentialId, rpId: seen?.rpId });
    let passkey: PasskeyItem = { ...data };
    if (!data.friendly_name || data.friendly_name === AUTH_DEFAULT_PASSKEY_NAME) {
      const label = deviceLabelFromUserAgent(typeof navigator !== "undefined" ? navigator.userAgent : "");
      const renamed = await supabase.auth.passkey.update({ passkeyId: data.id, friendlyName: label }).catch(() => null);
      if (renamed && !renamed.error) passkey = { ...passkey, friendly_name: label };
    }
    return { kind: "ok", passkey };
  } catch (caught) {
    const kind = classifySetupError(caught);
    if (kind === "exists") rememberKnownHere(userId);
    return { kind: "error", error: kind };
  }
}

export async function listPasskeys(): Promise<PasskeyItem[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw error;
  return data ?? [];
}

export async function renamePasskey(passkeyId: string, name: string): Promise<boolean> {
  const { error } = await supabase.auth.passkey.update({ passkeyId, friendlyName: name });
  return !error;
}

/**
 * «Отключить». After Auth removes it, a credential set up in this browser is reported to the
 * browser as unknown, so it stops being offered in the suggestions. The full list
 * (`signalAllAcceptedCredentials`) is not sent: Auth's list does not carry credential ids, and
 * an incomplete list would hide this person's other, still valid devices in a synced store.
 */
export async function turnOffPasskey(passkeyId: string): Promise<"ok" | "needs_code" | "failed"> {
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  if (error) return codeOf(error) === "insufficient_aal" ? "needs_code" : "failed";
  const entry = rememberGone(passkeyId);
  if (entry?.credentialId) signalUnknown(entry.rpId ?? window.location.hostname, entry.credentialId);
  return "ok";
}

/* ---------- «Входите быстрее» ---------- */

const OFFER_KEY = "rovno.passkey-offer.v1";
const OFFER_PAUSE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFER_MAX_DECLINES = 3;
export const PASSKEY_OFFER_PATH = "/auth/faster";

interface OfferState {
  declines: number;
  until: number;
}

function readOffer(): OfferState {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFER_KEY) ?? "null");
    return { declines: Number(parsed?.declines) || 0, until: Number(parsed?.until) || 0 };
  } catch {
    return { declines: 0, until: 0 };
  }
}

/** «Не сейчас»: 30 days of quiet in this browser; after the third, never again. */
export function declinePasskeyOffer(now = Date.now()): void {
  const state = readOffer();
  try {
    localStorage.setItem(OFFER_KEY, JSON.stringify({ declines: state.declines + 1, until: now + OFFER_PAUSE_MS }));
  } catch {
    // storage blocked: the screen may come back next time, which is harmless
  }
}

export function passkeyOfferPaused(now = Date.now()): boolean {
  const state = readOffer();
  return state.declines >= OFFER_MAX_DECLINES || now < state.until;
}
