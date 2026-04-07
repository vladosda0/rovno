/**
 * Contract-driven action state resolution.
 *
 * Execution semantics: docs/permissions.contract.json
 * Explanatory context: Permissions.md
 *
 * This module maps (role, domain, action) → ActionState using preset defaults
 * derived from the canonical permissions contract. It replaces ad-hoc boolean
 * checks wherever the contract specifies hidden / disabled_visible / enabled.
 *
 * The resolver accepts an optional `overrides` parameter (forward-compatible
 * stub for future Advanced permissions). When undefined, preset behavior is
 * used unchanged.
 */

import type { MemberRole } from "@/types/entities";

// ---------------------------------------------------------------------------
// Vocabulary (mirrors permissions.contract.json → vocab.action_state)
// ---------------------------------------------------------------------------

export type ActionState = "hidden" | "disabled_visible" | "enabled";

// ---------------------------------------------------------------------------
// Contract action keys — bounded set matching JSON domains.*.actions
// ---------------------------------------------------------------------------

export type EstimateAction = "edit_estimate_rows" | "edit_estimate_structure" | "export_csv";
export type TaskAction = "change_status" | "edit_checklist" | "comment" | "upload_document" | "upload_media" | "manage_tasks";
export type ProcurementAction = "order" | "receive" | "use_from_stock";

export type ContractAction = EstimateAction | TaskAction | ProcurementAction;

export type ContractDomain = "estimate" | "tasks" | "procurement";

// ---------------------------------------------------------------------------
// Preset tables — one-to-one with permissions.contract.json per_role.actions
// ---------------------------------------------------------------------------

const ESTIMATE_PRESETS: Record<MemberRole, Record<EstimateAction, ActionState>> = {
  owner:      { edit_estimate_rows: "enabled",  edit_estimate_structure: "enabled",  export_csv: "enabled" },
  co_owner:   { edit_estimate_rows: "enabled",  edit_estimate_structure: "enabled",  export_csv: "enabled" },
  contractor: { edit_estimate_rows: "hidden",   edit_estimate_structure: "hidden",   export_csv: "hidden" },
  viewer:     { edit_estimate_rows: "hidden",   edit_estimate_structure: "hidden",   export_csv: "hidden" },
};

const TASK_PRESETS: Record<MemberRole, Record<TaskAction, ActionState>> = {
  owner:      { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "enabled" },
  co_owner:   { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "enabled" },
  contractor: { change_status: "enabled", edit_checklist: "enabled", comment: "enabled", upload_document: "enabled", upload_media: "enabled", manage_tasks: "hidden" },
  viewer:     { change_status: "hidden",  edit_checklist: "hidden",  comment: "hidden",  upload_document: "hidden",  upload_media: "hidden",  manage_tasks: "hidden" },
};

const PROCUREMENT_PRESETS: Record<MemberRole, Record<ProcurementAction, ActionState>> = {
  owner:      { order: "enabled",          receive: "enabled",          use_from_stock: "enabled" },
  co_owner:   { order: "enabled",          receive: "enabled",          use_from_stock: "enabled" },
  contractor: { order: "disabled_visible", receive: "disabled_visible", use_from_stock: "disabled_visible" },
  viewer:     { order: "hidden",           receive: "hidden",           use_from_stock: "hidden" },
};

type DomainPresetMap = {
  estimate: Record<MemberRole, Record<EstimateAction, ActionState>>;
  tasks: Record<MemberRole, Record<TaskAction, ActionState>>;
  procurement: Record<MemberRole, Record<ProcurementAction, ActionState>>;
};

const DOMAIN_PRESETS: DomainPresetMap = {
  estimate: ESTIMATE_PRESETS,
  tasks: TASK_PRESETS,
  procurement: PROCUREMENT_PRESETS,
};

// ---------------------------------------------------------------------------
// Override types (stub — no persistence, no UI in this track)
// ---------------------------------------------------------------------------

/**
 * Forward-compatible override shape for Advanced permissions.
 * Each key is optional; when present it overrides the preset default.
 *
 * Constraints (enforced by future UI, not by this resolver):
 * - Overrides must not violate `forbidden_forever` rules per contract.
 * - Overrides must not exceed the acting user's own authority.
 * - Backend enforcement remains authoritative regardless of frontend overrides.
 */
export type PermissionOverrides = {
  estimate?: Partial<Record<EstimateAction, ActionState>>;
  tasks?: Partial<Record<TaskAction, ActionState>>;
  procurement?: Partial<Record<ProcurementAction, ActionState>>;
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function resolveActionState(
  role: MemberRole,
  domain: "estimate",
  action: EstimateAction,
  overrides?: PermissionOverrides,
): ActionState;
export function resolveActionState(
  role: MemberRole,
  domain: "tasks",
  action: TaskAction,
  overrides?: PermissionOverrides,
): ActionState;
export function resolveActionState(
  role: MemberRole,
  domain: "procurement",
  action: ProcurementAction,
  overrides?: PermissionOverrides,
): ActionState;
export function resolveActionState(
  role: MemberRole,
  domain: ContractDomain,
  action: ContractAction,
  overrides?: PermissionOverrides,
): ActionState {
  const domainOverrides = overrides?.[domain] as Record<string, ActionState> | undefined;
  if (domainOverrides?.[action] != null) {
    return domainOverrides[action];
  }
  const presets = DOMAIN_PRESETS[domain] as Record<MemberRole, Record<string, ActionState>>;
  return presets[role]?.[action] ?? "hidden";
}

// ---------------------------------------------------------------------------
// Convenience: boolean bridge for callers that still need can-style checks
// ---------------------------------------------------------------------------

/** True only when the resolved state is `enabled`. Strict — disabled_visible is NOT allowed. */
export function isActionEnabled(
  role: MemberRole,
  domain: ContractDomain,
  action: ContractAction,
  overrides?: PermissionOverrides,
): boolean {
  return resolveActionState(role, domain, action as never, overrides) === "enabled";
}

// ---------------------------------------------------------------------------
// UI rendering helper
// ---------------------------------------------------------------------------

export type ActionControlProps = {
  /** Whether the control should render at all. */
  visible: boolean;
  /** Whether the control is interactive. */
  disabled: boolean;
  /** Tooltip / title for disabled controls. Undefined when enabled or hidden. */
  disabledReason: string | undefined;
};

/**
 * Map an ActionState to render-time props for buttons / checkboxes / menu items.
 *
 * - `hidden`          → `{ visible: false, disabled: true }`
 * - `disabled_visible` → `{ visible: true,  disabled: true, disabledReason }`
 * - `enabled`         → `{ visible: true,  disabled: false }`
 */
export function actionStateToControlProps(
  state: ActionState,
  opts?: { disabledReason?: string },
): ActionControlProps {
  switch (state) {
    case "hidden":
      return { visible: false, disabled: true, disabledReason: undefined };
    case "disabled_visible":
      return {
        visible: true,
        disabled: true,
        disabledReason: opts?.disabledReason ?? "This action is not available for your role.",
      };
    case "enabled":
      return { visible: true, disabled: false, disabledReason: undefined };
  }
}
