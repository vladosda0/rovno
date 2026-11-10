import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Sign-in with Yandex ID and VK ID (epic external-login, slices 2-3). The exchange with
// the provider lives in the yandex-auth and vk-auth Edge Functions; this file starts it,
// finishes it on the callback page, reads the Connected accounts list and unlinks. The
// list RPC lives outside the generated Database type, the same as messenger-links.ts.
const rawSupabase = supabase as unknown as SupabaseClient;

export type LoginProvider = "yandex" | "vk";
export type ExternalMode = "login" | "link";
export type ExternalProofKind = "password" | "code" | "new_email" | "need_email";

const FUNCTION: Record<LoginProvider, string> = { yandex: "yandex-auth", vk: "vk-auth" };
const ATTEMPT_KEY: Record<LoginProvider, string> = {
  yandex: "rovno.yandex-login-attempt",
  vk: "rovno.vk-login-attempt",
};

export interface ExternalProof {
  token: string;
  kind: ExternalProofKind;
  /** The provider's email; null when VK gave none and the person names one. */
  email: string | null;
  name: string | null;
  next: string | null;
}

export type ExternalResult =
  | {
      // The function hands over a one-time token and the browser spends it with
      // verifyOtp, so Auth counts the check against the person's own address.
      outcome: "verify";
      verify: { token_hash: string; type: string };
      created: boolean;
      next: string | null;
    }
  | {
      // What yandex-auth answered before step 2.8; kept while a deploy of the two
      // repositories is in flight.
      outcome: "session";
      session: { access_token: string; refresh_token: string };
      created: boolean;
      next: string | null;
    }
  | ({ outcome: "proof" } & ExternalProof)
  | { outcome: "linked"; next: string | null }
  | { outcome: "taken" }
  | { outcome: "has_yandex" }
  | { outcome: "has_vk" }
  | { outcome: "failed"; reason?: string };

export interface StartedAttempt {
  state: string;
  mode: ExternalMode;
  next: string | null;
}

export interface LoginIdentity {
  provider: LoginProvider;
  email: string | null;
  /** The name the provider gave; shown when VK passed no email. */
  displayName: string | null;
  linkedAt: string;
}

async function callFunction<T>(provider: LoginProvider, body: Record<string, unknown>): Promise<T | { outcome: "failed" }> {
  const { data, error } = await supabase.functions.invoke(FUNCTION[provider], { body });
  if (error || !data) return { outcome: "failed" };
  return data as T;
}

/** Sends the person to the provider. Resolves false when the attempt could not start. */
export async function startExternalAuth(provider: LoginProvider, mode: ExternalMode, next: string | null): Promise<boolean> {
  const result = await callFunction<{ outcome: "redirect"; url: string; state: string }>(provider, {
    action: "start",
    mode,
    next,
  });
  if (result.outcome !== "redirect") return false;
  try {
    const attempt: StartedAttempt = { state: result.state, mode, next };
    sessionStorage.setItem(ATTEMPT_KEY[provider], JSON.stringify(attempt));
  } catch {
    return false;
  }
  window.location.assign(result.url);
  return true;
}

/**
 * The attempt this browser started, once. The state must match: a callback URL
 * opened from a stranger's link has none here, so it signs nobody in.
 */
export function takeStartedAttempt(provider: LoginProvider, state: string | null): StartedAttempt | null {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY[provider]);
    sessionStorage.removeItem(ATTEMPT_KEY[provider]);
    if (!raw) return null;
    const attempt = JSON.parse(raw) as StartedAttempt;
    return state && attempt.state === state ? attempt : null;
  } catch {
    return null;
  }
}

export function finishExternalCallback(
  provider: LoginProvider,
  params: { code: string; state: string; deviceId: string | null },
): Promise<ExternalResult> {
  return callFunction<ExternalResult>(provider, {
    action: "callback",
    code: params.code,
    state: params.state,
    ...(params.deviceId ? { device_id: params.deviceId } : {}),
  });
}

export function confirmExternalProof(provider: LoginProvider, token: string): Promise<ExternalResult> {
  return callFunction<ExternalResult>(provider, { action: "confirm", token });
}

export async function listLoginIdentities(): Promise<LoginIdentity[]> {
  const { data, error } = await rawSupabase.rpc("list_my_login_identities");
  if (error) throw new Error(error.message);
  return (
    (data ?? []) as { provider: LoginProvider; email: string | null; display_name?: string | null; linked_at: string }[]
  ).map((row) => ({
    provider: row.provider,
    email: row.email,
    displayName: row.display_name ?? null,
    linkedAt: row.linked_at,
  }));
}

/** Unlinks through the provider's function, which also sends the unlink letter (step 3.3). */
export async function unlinkLoginIdentity(provider: LoginProvider): Promise<void> {
  const { data, error } = await supabase.functions.invoke(FUNCTION[provider], { body: { action: "unlink" } });
  if (error) throw new Error(error.message);
  if ((data as { outcome?: string } | null)?.outcome !== "unlinked") throw new Error("unlink failed");
}
