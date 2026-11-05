import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Sign-in with Yandex ID (epic external-login, slice 2). The exchange with Yandex lives
// in the yandex-auth Edge Function; this file starts it, finishes it on the callback
// page and reads the Connected accounts list. The list RPCs live outside the generated
// Database type, the same as messenger-links.ts.
const rawSupabase = supabase as unknown as SupabaseClient;

const ATTEMPT_KEY = "rovno.yandex-login-attempt";

export type YandexMode = "login" | "link";
export type YandexProofKind = "password" | "code" | "new_email";

export interface YandexProof {
  token: string;
  kind: YandexProofKind;
  email: string;
  name: string | null;
  next: string | null;
}

export type YandexResult =
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
  | ({ outcome: "proof" } & YandexProof)
  | { outcome: "linked"; next: string | null }
  | { outcome: "taken" }
  | { outcome: "has_yandex" }
  | { outcome: "failed"; reason?: string };

interface StartedAttempt {
  state: string;
  mode: YandexMode;
  next: string | null;
}

export interface LoginIdentity {
  provider: "yandex";
  email: string | null;
  linkedAt: string;
}

async function callYandexAuth<T>(body: Record<string, unknown>): Promise<T | { outcome: "failed" }> {
  const { data, error } = await supabase.functions.invoke("yandex-auth", { body });
  if (error || !data) return { outcome: "failed" };
  return data as T;
}

/** Sends the person to Yandex. Resolves false when the attempt could not start. */
export async function startYandexAuth(mode: YandexMode, next: string | null): Promise<boolean> {
  const result = await callYandexAuth<{ outcome: "redirect"; url: string; state: string }>({
    action: "start",
    mode,
    next,
  });
  if (result.outcome !== "redirect") return false;
  try {
    const attempt: StartedAttempt = { state: result.state, mode, next };
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
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
export function takeStartedAttempt(state: string | null): StartedAttempt | null {
  try {
    const raw = sessionStorage.getItem(ATTEMPT_KEY);
    sessionStorage.removeItem(ATTEMPT_KEY);
    if (!raw) return null;
    const attempt = JSON.parse(raw) as StartedAttempt;
    return state && attempt.state === state ? attempt : null;
  } catch {
    return null;
  }
}

export function finishYandexCallback(code: string, state: string): Promise<YandexResult> {
  return callYandexAuth<YandexResult>({ action: "callback", code, state });
}

export function confirmYandexProof(token: string): Promise<YandexResult> {
  return callYandexAuth<YandexResult>({ action: "confirm", token });
}

export async function listLoginIdentities(): Promise<LoginIdentity[]> {
  const { data, error } = await rawSupabase.rpc("list_my_login_identities");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { provider: "yandex"; email: string | null; linked_at: string }[]).map((row) => ({
    provider: row.provider,
    email: row.email,
    linkedAt: row.linked_at,
  }));
}

export async function unlinkLoginIdentity(provider: "yandex"): Promise<void> {
  const { error } = await rawSupabase.rpc("unlink_login_identity", { p_provider: provider });
  if (error) throw new Error(error.message);
}
