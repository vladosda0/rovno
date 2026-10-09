/** The option that follows the browser. Never stored: the database gets the zone it stands for. */
export const AUTO_TIMEZONE = "auto";

const KEY_PREFIX = "profile-timezone-from-browser:";

/** `true`: the stored zone was taken from this browser; `false`: picked by hand; `null`: never settled here. */
export type TimezoneFromBrowser = boolean | null;

/**
 * How a real UTC is stored. The server reads a bare `UTC`, the column default, as "no zone
 * chosen" and sends such a person no briefing.
 */
export const REAL_UTC_TIMEZONE = "Etc/UTC";
/** The UTC option of the profile's select: the stored default and a real UTC both show as it. */
export const UTC_OPTION = "UTC";
const UTC_NAMES = new Set(["UTC", "Etc/UTC", "GMT", "Etc/GMT"]);
const UNKNOWN_ZONE = "Etc/Unknown";

/** The browser's zone in the form the database should hold, or null when the browser names none. */
export function readBrowserTimezone(): string | null {
  try {
    const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "").trim();
    if (!zone || zone === UNKNOWN_ZONE) return null;
    return UTC_NAMES.has(zone) ? REAL_UTC_TIMEZONE : zone;
  } catch {
    return null;
  }
}

/** The zone to store for an option picked in the profile's select, the auto option aside. */
export function timezoneToStore(selected: string): string {
  return selected === UTC_OPTION ? REAL_UTC_TIMEZONE : selected;
}

/** The column default (`UTC`), the legacy `auto`, or nothing: no zone was ever chosen. */
export function isUnsetProfileTimezone(timezone: string | null | undefined): boolean {
  return !timezone || timezone === AUTO_TIMEZONE || timezone === UTC_OPTION;
}

export function readTimezoneFromBrowser(profileId: string): TimezoneFromBrowser {
  if (!profileId) return null;
  try {
    const raw = localStorage.getItem(KEY_PREFIX + profileId);
    return raw === "1" ? true : raw === "0" ? false : null;
  } catch {
    return null;
  }
}

export function rememberTimezoneFromBrowser(profileId: string, fromBrowser: boolean): void {
  if (!profileId) return;
  try {
    localStorage.setItem(KEY_PREFIX + profileId, fromBrowser ? "1" : "0");
  } catch {
    // Storage is unavailable: the profile shows the zone by name, and the zone itself is still right.
  }
}

/**
 * What the profile's timezone select shows for a stored zone. The auto option stands for a zone
 * taken from this browser for as long as the two still agree.
 */
export function timezoneSelectValue(stored: string | null | undefined, fromBrowser: TimezoneFromBrowser): string {
  if (!stored || stored === AUTO_TIMEZONE) return AUTO_TIMEZONE;
  if (fromBrowser === true && stored === readBrowserTimezone()) return AUTO_TIMEZONE;
  return stored === REAL_UTC_TIMEZONE ? UTC_OPTION : stored;
}
