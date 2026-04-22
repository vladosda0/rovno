import type {
  AIAccess,
  FinanceVisibility,
  InternalDocsVisibility,
  MemberRole,
  ViewerRegime,
} from "@/types/entities";

// All label maps now hold i18n keys. Callers must translate via useTranslation's t().
export const roleLabels: Record<MemberRole, string> = {
  owner: "participants.role.owner",
  co_owner: "participants.role.coOwner",
  contractor: "participants.role.contractor",
  viewer: "participants.role.viewer",
};

export const roleDescriptions: Record<MemberRole, string> = {
  owner: "participants.roleDescription.owner",
  co_owner: "participants.roleDescription.coOwner",
  contractor: "participants.roleDescription.contractor",
  viewer: "participants.roleDescription.viewer",
};

export const aiAccessLabels: Record<AIAccess, string> = {
  none: "participants.aiAccess.none",
  consult_only: "participants.aiAccess.consultOnly",
  project_pool: "participants.aiAccess.projectPool",
};

export const financeVisibilityLabels: Record<FinanceVisibility, string> = {
  none: "participants.financeVisibility.none",
  summary: "participants.financeVisibility.summary",
  detail: "participants.financeVisibility.detail",
};

export const internalDocsVisibilityLabels: Record<InternalDocsVisibility, string> = {
  none: "participants.internalDocs.none",
  view: "participants.internalDocs.view",
  edit: "participants.internalDocs.edit",
};

export const viewerRegimeLabels: Record<ViewerRegime, string> = {
  contractor: "participants.viewerRegime.contractor",
  client: "participants.viewerRegime.client",
  build_myself: "participants.viewerRegime.buildMyself",
};

export const MEMBER_INVITE_ROLES: readonly MemberRole[] = ["co_owner", "contractor", "viewer"];

const INVITE_ROLE_OPTIONS_BY_ACTOR: Record<MemberRole, MemberRole[]> = {
  owner: ["co_owner", "contractor", "viewer"],
  co_owner: ["contractor", "viewer"],
  contractor: [],
  viewer: [],
};

const AI_ACCESS_RANK: readonly AIAccess[] = ["none", "consult_only", "project_pool"];
const FINANCE_VISIBILITY_RANK: readonly FinanceVisibility[] = ["none", "summary", "detail"];
const INTERNAL_DOCS_VISIBILITY_RANK: readonly InternalDocsVisibility[] = ["none", "view", "edit"];

export type PermissionSummaryInput = {
  role: MemberRole;
  aiAccess: AIAccess;
  financeVisibility?: FinanceVisibility;
  internalDocsVisibility?: InternalDocsVisibility;
  viewerRegime?: ViewerRegime | null;
  creditLimit: number;
};

export type NonStandardAccessSummary = {
  title: string;
  lines: string[];
};

// Minimal translator signature — matches react-i18next's t() without requiring an import
// that would add coupling between the policy module and i18n infrastructure at type-check time.
export type Translator = (key: string, options?: Record<string, unknown>) => string;

export function getInviteRoleOptions(actorRole: MemberRole): MemberRole[] {
  return INVITE_ROLE_OPTIONS_BY_ACTOR[actorRole];
}

export function getReassignRoleOptions(
  actorRole: MemberRole,
  targetCurrentRole: MemberRole,
): MemberRole[] {
  if (targetCurrentRole === "owner") return [];

  if (actorRole === "owner") return ["co_owner", "contractor", "viewer"];

  if (actorRole === "co_owner") {
    return targetCurrentRole === "contractor" || targetCurrentRole === "viewer"
      ? ["contractor", "viewer"]
      : [];
  }

  return [];
}

export function canEditParticipantRole(actorRole: MemberRole, targetCurrentRole: MemberRole): boolean {
  return getReassignRoleOptions(actorRole, targetCurrentRole).length > 0;
}

export function getInviteAiAccessOptions(actorAiAccess: AIAccess): AIAccess[] {
  return sliceRank(AI_ACCESS_RANK, actorAiAccess, ["none"]);
}

export function getFinanceVisibilityOptions(
  actorRole: MemberRole,
  actorFinanceVisibility?: FinanceVisibility,
): FinanceVisibility[] {
  if (actorRole === "owner") return [...FINANCE_VISIBILITY_RANK];
  if (!actorFinanceVisibility) return ["none"];
  return sliceRank(FINANCE_VISIBILITY_RANK, actorFinanceVisibility, ["none"]);
}

export function getInternalDocsVisibilityOptions(
  actorRole: MemberRole,
  actorInternalDocsVisibility?: InternalDocsVisibility,
): InternalDocsVisibility[] {
  if (actorRole === "owner") return [...INTERNAL_DOCS_VISIBILITY_RANK];
  if (!actorInternalDocsVisibility) return ["none"];
  return sliceRank(INTERNAL_DOCS_VISIBILITY_RANK, actorInternalDocsVisibility, ["none"]);
}

export function describePermissionSummary(input: PermissionSummaryInput, t: Translator): string[] {
  const summary = [
    t(roleDescriptions[input.role]),
    t("participants.summary.ai", { value: t(aiAccessLabels[input.aiAccess]) }),
    t("participants.summary.finance", { value: t(financeVisibilityLabels[input.financeVisibility ?? "none"]) }),
    t("participants.summary.internalDocs", { value: t(internalDocsVisibilityLabels[input.internalDocsVisibility ?? "none"]) }),
    t("participants.summary.creditLimit", { value: input.creditLimit }),
  ];

  if (input.role === "viewer") {
    summary.push(t("participants.summary.viewerRegime", { value: t(viewerRegimeLabels[input.viewerRegime ?? "client"]) }));
  }

  return summary;
}

export function getPermissionWarnings(input: PermissionSummaryInput, t: Translator): string[] {
  const warnings: string[] = [];
  const financeVisibility = input.financeVisibility ?? getDefaultFinanceVisibility(input.role);

  if (input.role === "viewer" && financeVisibility !== getDefaultFinanceVisibility("viewer")) {
    warnings.push(t("participants.warning.viewerNonStandard1"));
    warnings.push(t("participants.warning.viewerNonStandard2"));
    warnings.push(t("participants.warning.viewerNonStandard3"));
    return warnings;
  }

  if (input.role === "contractor" && financeVisibility !== getDefaultFinanceVisibility("contractor")) {
    warnings.push(t("participants.warning.contractorNonStandard1"));
    warnings.push(t("participants.warning.contractorNonStandard2"));
    warnings.push(t("participants.warning.contractorNonStandard3"));
    return warnings;
  }

  if (input.role === "co_owner") {
    warnings.push(t("participants.warning.coOwnerManage"));
  }

  if (input.aiAccess === "project_pool") {
    warnings.push(t("participants.warning.aiProjectPool"));
  }

  if (financeVisibility === "detail") {
    warnings.push(t("participants.warning.financeDetail"));
  }

  if ((input.internalDocsVisibility ?? "none") === "edit") {
    warnings.push(t("participants.warning.docsEdit"));
  }

  return warnings;
}

export function getDefaultFinanceVisibility(role: MemberRole): FinanceVisibility {
  if (role === "owner" || role === "co_owner") return "detail";
  return "none";
}

export function getDefaultInternalDocsVisibility(role: MemberRole): InternalDocsVisibility {
  return role === "viewer" ? "none" : "view";
}

export function hasNonStandardSupportedAccess(input: Pick<PermissionSummaryInput, "role" | "financeVisibility">): boolean {
  if (input.role !== "viewer" && input.role !== "contractor") return false;
  return (input.financeVisibility ?? getDefaultFinanceVisibility(input.role)) !== getDefaultFinanceVisibility(input.role);
}

export function getNonStandardAccessSummary(
  input: Pick<PermissionSummaryInput, "role" | "financeVisibility">,
  t: Translator,
): NonStandardAccessSummary | null {
  if (!hasNonStandardSupportedAccess(input)) return null;

  if (input.role === "viewer") {
    return {
      title: t("participants.nonStandard.viewer.title"),
      lines: [t("participants.nonStandard.viewer.line1")],
    };
  }

  if (input.role === "contractor") {
    return {
      title: t("participants.nonStandard.contractor.title"),
      lines: [t("participants.nonStandard.contractor.line1")],
    };
  }

  return null;
}

function sliceRank<T extends string>(rank: readonly T[], current: T, fallback: T[]): T[] {
  const maxIndex = rank.indexOf(current);
  if (maxIndex < 0) return fallback;
  return rank.slice(0, maxIndex + 1);
}
