/**
 * Contract-sensitive permission surfaces — discovery index.
 *
 * Execution semantics: docs/permissions.contract.json
 *
 * This file exists solely to make contract-dependent code paths easier to find
 * when the permissions contract changes. It introduces no runtime behavior.
 *
 * When docs/permissions.contract.json is updated, audit the paths listed below.
 *
 * Track 4 (documents/media + activity): UI uses `internal-docs-visibility` and
 * `activity-display` for presentation alignment with the contract. This is not
 * full AI/tool hardening — server payloads and AI runtime policy are separate.
 */

// ---------------------------------------------------------------------------
// Authority seam (data layer)
// ---------------------------------------------------------------------------

export {
  type ProjectAuthoritySeam,
  buildProjectAuthoritySeam,
} from "@/lib/project-authority-seam";

// ---------------------------------------------------------------------------
// Domain access + financial visibility gates
// ---------------------------------------------------------------------------

export {
  getProjectDomainAccessForRole,
  getProjectDomainAccess,
  projectDomainAllowsView,
  projectDomainAllowsContribute,
  projectDomainAllowsManage,
  seamCanViewSensitiveDetail,
  seamCanViewOperationalFinanceSummary,
  seamCanLoadOperationalSemantics,
  seamEstimateFinanceVisibilityMode,
  seamAllowsEstimateExportCsv,
} from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Contract action state resolver (Track 3)
// ---------------------------------------------------------------------------

export {
  resolveActionState,
  isActionEnabled,
  actionStateToControlProps,
  type ActionState,
  type ContractAction,
  type ContractDomain,
  type PermissionOverrides,
  type ActionControlProps,
} from "@/lib/permission-contract-actions";

// ---------------------------------------------------------------------------
// Legacy coarse action matrix (narrowed in Track 3)
// ---------------------------------------------------------------------------

export { can, type Action } from "@/lib/permission-matrix";

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

export { usePermission, seamAllowsAction, seamResolveActionState } from "@/lib/permissions";
