import type { User } from "@supabase/supabase-js";

export const EMAIL_CODE_LENGTH = 6;

/** Keeps the digits of a typed or pasted code: "482 913" and "482-913" give "482913". */
export function normalizeEmailCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}

/**
 * True when this sign-in is the one that confirmed the email, i.e. the account
 * was just registered. Compares two server timestamps from the same verify
 * (an already confirmed account keeps its old confirmation time), so a wrong
 * device clock does not matter. Assumes email confirmations are on (staging and
 * prod: mailer_autoconfirm false); with autoconfirm the stamps drift apart.
 */
export function isJustConfirmed(user: Pick<User, "email_confirmed_at" | "last_sign_in_at">): boolean {
  const confirmedAt = Date.parse(user.email_confirmed_at ?? "");
  const signedInAt = Date.parse(user.last_sign_in_at ?? "");
  return Number.isFinite(confirmedAt) && Number.isFinite(signedInAt) && Math.abs(signedInAt - confirmedAt) < 60_000;
}
