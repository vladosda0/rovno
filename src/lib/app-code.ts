/** The code from the authenticator app (epic external-login, slice 4): six digits. */
export const APP_CODE_LENGTH = 6;

/** Six digits out of whatever was typed or pasted: «482 913», «482-913», «482913». */
export function normalizeAppCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, APP_CODE_LENGTH);
}
