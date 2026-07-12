/**
 * Honest render-state model for project domain lists (Tasks / Procurement / HR).
 *
 * The UI must never render "0 items" (or ₽0) while the truth is actually
 * "still loading", "hidden by permissions", or "estimate sync in progress".
 * Resolve the ambiguity once, here, and let pages branch on a single state.
 */
export type ProjectDataGateState =
  | "loading" // query or permissions still resolving — show skeleton, not empty
  | "redacted" // hidden by role/permissions — "no access", not "no items"
  | "syncing" // list is empty but an estimate projection is in flight
  | "empty" // genuinely no rows, permissions fine, nothing in flight
  | "ready"; // rows available

export interface ProjectDataGateInput {
  /** Query or permission resolution still pending. */
  isLoading: boolean;
  /** False when the domain is hidden for this role (e.g. HR for non-owners). */
  readsEnabled?: boolean;
  /** An estimate→domain projection is currently running. */
  isSyncing?: boolean;
  /** The list resolved to zero rows. */
  isEmpty: boolean;
}

export function resolveProjectDataGateState(input: ProjectDataGateInput): ProjectDataGateState {
  // Loading wins over redacted: while permissions resolve, readsEnabled is
  // computed from a fail-closed default and would falsely claim "no access".
  if (input.isLoading) return "loading";
  if (input.readsEnabled === false) return "redacted";
  if (!input.isEmpty) return "ready";
  if (input.isSyncing) return "syncing";
  return "empty";
}
