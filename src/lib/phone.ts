/** Russian phone helpers shared by the Визитка and Settings profile forms. */

/** Default value so the user starts typing after the country code. */
export const PHONE_PREFILL = "+7 ";

/** A phone counts as "filled" only when it has digits beyond the +7 prefix. */
export function phoneIsFilled(value: string): boolean {
  return value.replace(/\D/g, "").length > 1;
}

/** Trimmed phone for persistence, or null when only the prefix is present. */
export function phoneValueForSave(value: string): string | null {
  return phoneIsFilled(value) ? value.trim() : null;
}
