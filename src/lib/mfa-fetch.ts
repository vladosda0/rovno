/**
 * The Supabase client's fetch (epic external-login, slice 4). When PostgREST (403, message
 * «mfa_required») or one of our functions (403, error «mfa_required») refuses a session that
 * has not passed the second sign-in step, the app hears it through MFA_REQUIRED_EVENT and
 * shows the second step instead of empty pages.
 * Kept apart from `@/lib/mfa`, which imports the client itself.
 */

/** Fired when PostgREST or one of our functions answers 403 «mfa_required». */
export const MFA_REQUIRED_EVENT = "rovno:mfa-required";

/** A fetch for the Supabase client: tells the app when the server asks for the second step. */
export function mfaAwareFetch(base?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await (base ?? fetch)(input, init);
    if (response.status === 403 && typeof window !== "undefined") {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const rest = url.includes("/rest/v1/");
      if (rest || url.includes("/functions/v1/")) {
        try {
          const body = await response.clone().json();
          const refused = rest ? body?.message === "mfa_required" : body?.error === "mfa_required";
          if (refused) window.dispatchEvent(new Event(MFA_REQUIRED_EVENT));
        } catch {
          // not JSON: not ours
        }
      }
    }
    return response;
  };
}
