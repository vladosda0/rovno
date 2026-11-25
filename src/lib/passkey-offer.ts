/**
 * Whether «Входите быстрее» comes between sign-in and the page the person was going to
 * (epic external-login, slice 5, step 5.8, mockup frame 9).
 *
 * Callers are the finish of the sign-in that already passed the second step: password and
 * code from the email (Login), Yandex ID and VK ID (ExternalLoginCallback), the code from the
 * app (MfaChallenge). Never after a sign-in by face or fingerprint, never after a recovery
 * code (MfaChallenge does not ask), never for an invitation link or before onboarding.
 */
import { hasCompletedOnboarding } from "@/lib/auth-state";
import { passkeysEnabledOnServer } from "@/lib/passkey-availability";
import { PASSKEY_OFFER_PATH, passkeyKnownHere, passkeyOfferPaused, passkeysSetUpHere, passkeySupported, platformAuthenticatorAvailable } from "@/lib/passkey";

const NO_OFFER_PREFIXES = ["/invite", "/onboarding", "/auth/", "/promo"];

export function passkeyOfferPathFor(destination: string): string {
  return `${PASSKEY_OFFER_PATH}?next=${encodeURIComponent(destination)}`;
}

/** The destination itself, or «Входите быстрее» leading to it. Any doubt means no offer. */
export async function withPasskeyOffer(
  destination: string,
  { userId, completedOnboarding }: { userId: string; completedOnboarding?: boolean },
): Promise<string> {
  try {
    const path = destination.toLowerCase();
    if (!passkeySupported() || NO_OFFER_PREFIXES.some((p) => path.startsWith(p))) return destination;
    if (passkeyOfferPaused() || passkeysSetUpHere(userId).length > 0 || passkeyKnownHere(userId)) return destination;
    if (!(await passkeysEnabledOnServer())) return destination;
    const onboarded = completedOnboarding ?? (await hasCompletedOnboarding(userId));
    if (!onboarded) return destination;
    if (!(await platformAuthenticatorAvailable())) return destination;
    return passkeyOfferPathFor(destination);
  } catch {
    return destination;
  }
}
