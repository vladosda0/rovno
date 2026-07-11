/**
 * Participants screen redesign (single list + drawer, PRD 2026-07-10).
 *
 * Enabled by default; this is a release kill switch, not an opt-in:
 * - env: set `VITE_PARTICIPANTS_REDESIGN` to `0`, `false`, `no`, or `off` to
 *   force the legacy tabs screen (build-time, mirrors VITE_AI_LIVE_TEXT_ASSISTANT).
 * - localStorage `participants-redesign` = same values for a per-browser
 *   override (diagnostics on a live environment without a rebuild).
 */

const OFF_VALUES = new Set(["0", "false", "no", "off"]);
const ON_VALUES = new Set(["1", "true", "yes", "on"]);

export function isParticipantsRedesignEnabled(): boolean {
  try {
    const override = window.localStorage.getItem("participants-redesign");
    if (override != null) {
      const normalized = override.trim().toLowerCase();
      if (OFF_VALUES.has(normalized)) return false;
      if (ON_VALUES.has(normalized)) return true;
    }
  } catch {
    // Prerender/SSR or storage access denied — fall through to the env value.
  }

  const raw = import.meta.env.VITE_PARTICIPANTS_REDESIGN;
  if (typeof raw === "string" && OFF_VALUES.has(raw.trim().toLowerCase())) return false;
  return true;
}
