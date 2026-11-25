/**
 * Two-factor protection with an authenticator app (epic external-login, slice 4).
 *
 * Auth (GoTrue) owns the factor: enrolment, the QR code, the six-digit check and the session
 * level (aal1 after the first step, aal2 after the code from the app). Recovery codes and
 * turning the protection off go through the rovno-db function `mfa-recovery`, which also
 * sends the letters. The server refuses an aal1 session of a person with a verified factor
 * (PostgREST answers 403 «mfa_required»), so the second step here is a door, not a curtain.
 */
import { supabase } from "@/integrations/supabase/client";
import { safeNextPath } from "@/lib/safe-next-path";

export { MFA_REQUIRED_EVENT } from "@/lib/mfa-fetch";

export const MFA_PATH = "/auth/mfa";
export const RECOVERY_CODE_FILE = "rovno-recovery-codes.txt";
export const LOW_CODES = 3;

/**
 * Pages a signed-in session that still owes the second step may stay on: sign-in itself and
 * the static pages (legal texts and the theme demo). Every other page reads data through the person's own session, which
 * the server refuses until the second step, so the gate sends them to the code screen instead.
 * Signed-out visitors are not gated at all. Routes match case-insensitively, so this does too.
 */
export function isMfaFreePath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (path.startsWith("/auth/")) return true;
  return ["/offer", "/privacy", "/refund", "/contacts", "/theme"].includes(path.replace(/\/+$/, ""));
}

/** The aal claim of an access token, or null when it cannot be read. */
export function aalOfToken(token: string | null | undefined): string | null {
  try {
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

/** Where the second step sends the person afterwards; only paths inside the site. */
export function mfaNext(next: string | null | undefined): string {
  const path = safeNextPath(next ?? null);
  return !path || path.startsWith(MFA_PATH) ? "/home" : path;
}

export function mfaPathFor(next: string): string {
  return `${MFA_PATH}?next=${encodeURIComponent(next)}`;
}

/**
 * True when the session signed in by face or fingerprint (a passkey; epic external-login,
 * slice 5, step 5.10, Vlad 2026-11-16 «Лицо заменяет код»). Auth gives such a session aal1 and
 * this cannot be configured, so the second step counts it as passed by our own rule; the
 * server (`mfa_pre_request`, `mfaBlocked`) applies the same rule to the `amr` of the token.
 */
export function signedInByPasskey(methods: ReadonlyArray<{ method?: string } | string> | null | undefined): boolean {
  // Only the object shape GoTrue emits counts, as on the server (mfaGateForToken).
  return (methods ?? []).some((m) => typeof m === "object" && m !== null && m.method === "passkey");
}

/** True when this session still has to pass the code from the app. */
export async function isSecondStepRequired(): Promise<boolean> {
  // A failed check answers «not required»: the server still refuses such a session, so the
  // worst case is a refusal on screen, never an open door.
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    if (signedInByPasskey(data.currentAuthenticationMethods)) return false;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

/**
 * True when Auth will want the code from the app before a sensitive change: the protection is
 * on and the session is aal1. That is the case after a sign-in by face or fingerprint, which
 * opens the app (above) but not adding or removing such a device, where Auth asks for aal2
 * (agent decision 2026-11-16/17, item 3; mockup frame 6 on the left).
 */
export async function isAppCodeOwedForChange(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return false;
    return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
  } catch {
    return false;
  }
}

export interface TotpFactor {
  id: string;
  status: "verified" | "unverified";
  createdAt: string;
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.all ?? [])
    .filter((f) => f.factor_type === "totp")
    .map((f) => ({ id: f.id, status: f.status as TotpFactor["status"], createdAt: f.created_at }));
}

/** The six digits from the app against Auth; raises the session to aal2. */
export async function verifyAppCode(factorId: string, code: string): Promise<"ok" | "invalid" | "too_many" | "failed"> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (!error) return "ok";
  const status = (error as { status?: number }).status;
  const code_ = (error as { code?: string }).code;
  if (status === 429 || code_ === "over_request_rate_limit") return "too_many";
  if (status === 422 || status === 400 || code_ === "mfa_verification_failed") return "invalid";
  return "failed";
}

export type RecoveryAction = "status" | "generate" | "confirm" | "redeem";

export interface RecoveryResult<T = Record<string, unknown>> {
  status: number;
  body: T & { error?: string };
}

/** Calls `mfa-recovery` and reads its answer, including the error body of a non-2xx reply. */
export async function callMfaRecovery<T = Record<string, unknown>>(
  action: RecoveryAction,
  extra: Record<string, unknown> = {},
): Promise<RecoveryResult<T>> {
  const { data, error } = await supabase.functions.invoke("mfa-recovery", { body: { action, ...extra } });
  if (!error) return { status: 200, body: (data ?? {}) as RecoveryResult<T>["body"] };
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      return { status: context.status, body };
    } catch {
      return { status: context.status, body: { error: "failed" } as RecoveryResult<T>["body"] };
    }
  }
  return { status: 0, body: { error: "failed" } as RecoveryResult<T>["body"] };
}

export interface RecoveryStatus {
  enabled: boolean;
  since: string | null;
  left: number;
  confirmed: boolean;
}

/** The key the app needs when the QR code does not scan, in groups of four. */
export function groupKey(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export function recoveryCodesFile(codes: string[], email: string | null): string {
  const who = email ? ` для ${email}` : "";
  return `Коды восстановления Rovno${who}\nКаждый код срабатывает один раз.\n\n${codes.join("\n")}\n`;
}

/** Saves the codes as a text file; false where the browser refuses. */
export function downloadRecoveryCodes(codes: string[], email: string | null): boolean {
  try {
    const blob = new Blob([recoveryCodesFile(codes, email)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = RECOVERY_CODE_FILE;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
