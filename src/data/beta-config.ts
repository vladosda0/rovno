// Beta countdown configuration for the pricing block (<BetaCountdown>).
//
// Disabled for phase 1c: there is no committed beta-end date yet. To show the
// timer, flip BETA_COUNTDOWN_ENABLED to true and set a real BETA_END. Kept as a
// reviewed code constant (not an env var) so changing the date is a deliberate
// change rather than a silent dashboard toggle.

export const BETA_COUNTDOWN_ENABLED = false;

// Placeholder. Only consulted when BETA_COUNTDOWN_ENABLED is true.
export const BETA_END = new Date("2026-09-01T00:00:00Z");
