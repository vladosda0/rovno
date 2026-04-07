import type {
  AIAccess,
  FinanceVisibility,
  InternalDocsVisibility,
  MemberRole,
  ViewerRegime,
} from "@/types/entities";

export const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  contractor: "Contractor",
  viewer: "Viewer",
};

export const roleDescriptions: Record<MemberRole, string> = {
  owner: "Primary project owner access.",
  co_owner: "Shared project management access.",
  contractor: "Working contributor access.",
  viewer: "Read-only viewer access.",
};

export const aiAccessLabels: Record<AIAccess, string> = {
  none: "No AI",
  consult_only: "Consult only",
  project_pool: "Project pool",
};

export const financeVisibilityLabels: Record<FinanceVisibility, string> = {
  none: "No finance visibility",
  summary: "Finance summary",
  detail: "Full finance detail",
};

export const internalDocsVisibilityLabels: Record<InternalDocsVisibility, string> = {
  none: "No internal docs & media",
  view: "View internal docs & media",
  edit: "Edit internal docs & media",
};

export const viewerRegimeLabels: Record<ViewerRegime, string> = {
  contractor: "Contractor",
  client: "Client",
  build_myself: "Build myself",
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

export function describePermissionSummary(input: PermissionSummaryInput): string[] {
  const summary = [
    roleDescriptions[input.role],
    `AI: ${aiAccessLabels[input.aiAccess]}.`,
    `Finance: ${financeVisibilityLabels[input.financeVisibility ?? "none"]}.`,
    `Internal docs & media: ${internalDocsVisibilityLabels[input.internalDocsVisibility ?? "none"]}.`,
    `Credit limit: ${input.creditLimit}.`,
  ];

  if (input.role === "viewer") {
    summary.push(`Viewer regime: ${viewerRegimeLabels[input.viewerRegime ?? "client"]}.`);
  }

  return summary;
}

export function getPermissionWarnings(input: PermissionSummaryInput): string[] {
  const warnings: string[] = [];
  const financeVisibility = input.financeVisibility ?? getDefaultFinanceVisibility(input.role);

  if (input.role === "viewer" && financeVisibility !== getDefaultFinanceVisibility("viewer")) {
    warnings.push("Вы открываете пользователю нестандартный доступ.");
    warnings.push("Пользователь получит доступ к важным разделам или чувствительным данным проекта.");
    warnings.push("Перепроверьте параметры перед сохранением / отправкой инвайта.");
    return warnings;
  }

  if (input.role === "contractor" && financeVisibility !== getDefaultFinanceVisibility("contractor")) {
    warnings.push("Вы расширяете доступ подрядчика за пределы стандартной роли.");
    warnings.push("Пользователь сможет видеть или изменять дополнительные разделы проекта.");
    warnings.push("Перепроверьте параметры перед сохранением / отправкой инвайта.");
    return warnings;
  }

  if (input.role === "co_owner") {
    warnings.push("Co-owners can manage the project in the current app flow.");
  }

  if (input.aiAccess === "project_pool") {
    warnings.push("Project pool AI access can spend project credits.");
  }

  if (financeVisibility === "detail") {
    warnings.push("Full finance detail exposes budget and cost line items.");
  }

  if ((input.internalDocsVisibility ?? "none") === "edit") {
    warnings.push("Edit access allows changing internal documents and media.");
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
): NonStandardAccessSummary | null {
  if (!hasNonStandardSupportedAccess(input)) return null;

  if (input.role === "viewer") {
    return {
      title: "Участнику заданы нестандартные параметры доступа",
      lines: [
        "Проверьте расширение финансовой видимости перед сохранением / отправкой инвайта.",
      ],
    };
  }

  if (input.role === "contractor") {
    return {
      title: "Для подрядчика заданы нестандартные параметры доступа",
      lines: [
        "Проверьте расширение финансовой видимости перед сохранением / отправкой инвайта.",
      ],
    };
  }

  return null;
}

function sliceRank<T extends string>(rank: readonly T[], current: T, fallback: T[]): T[] {
  const maxIndex = rank.indexOf(current);
  if (maxIndex < 0) return fallback;
  return rank.slice(0, maxIndex + 1);
}
