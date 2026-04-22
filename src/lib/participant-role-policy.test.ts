import { describe, expect, it } from "vitest";
import type { AIAccess, MemberRole } from "@/types/entities";
import {
  describePermissionSummary,
  getDefaultFinanceVisibility,
  getInviteAiAccessOptions,
  getInviteRoleOptions,
  getNonStandardAccessSummary,
  getPermissionWarnings,
  getReassignRoleOptions,
  hasNonStandardSupportedAccess,
  internalDocsVisibilityLabels,
} from "@/lib/participant-role-policy";

// A pass-through translator used in tests: returns the key, interpolating any {{value}}
// placeholder. When the key does not contain a placeholder for an option, the option's
// value is appended so that assertions checking .toContain(...) still succeed on the
// structural output (keys + their substituted values).
const t = (key: string, options?: Record<string, unknown>): string => {
  if (!options) return key;
  let out = key;
  for (const [name, value] of Object.entries(options)) {
    const placeholder = `{{${name}}}`;
    if (out.includes(placeholder)) {
      out = out.replaceAll(placeholder, String(value));
    } else {
      out = `${out} ${String(value)}`;
    }
  }
  return out;
};

function assertRolesEqual(actual: MemberRole[], expected: MemberRole[]) {
  expect(actual).toEqual(expected);
}

function assertAiEqual(actual: AIAccess[], expected: AIAccess[]) {
  expect(actual).toEqual(expected);
}

describe("participant-role-policy", () => {
  describe("getInviteRoleOptions", () => {
    it("owner can invite co_owner/contractor/viewer", () => {
      assertRolesEqual(getInviteRoleOptions("owner"), ["co_owner", "contractor", "viewer"]);
    });

    it("co_owner can invite contractor/viewer only", () => {
      assertRolesEqual(getInviteRoleOptions("co_owner"), ["contractor", "viewer"]);
    });

    it("contractor/viewer cannot invite", () => {
      assertRolesEqual(getInviteRoleOptions("contractor"), []);
      assertRolesEqual(getInviteRoleOptions("viewer"), []);
    });
  });

  describe("getReassignRoleOptions", () => {
    it("never offers owner target reassignment", () => {
      assertRolesEqual(getReassignRoleOptions("owner", "owner"), []);
      assertRolesEqual(getReassignRoleOptions("co_owner", "owner"), []);
    });

    it("owner can assign co_owner/contractor/viewer", () => {
      assertRolesEqual(getReassignRoleOptions("owner", "contractor"), ["co_owner", "contractor", "viewer"]);
      assertRolesEqual(getReassignRoleOptions("owner", "viewer"), ["co_owner", "contractor", "viewer"]);
    });

    it("co_owner can assign contractor/viewer only for contractor or viewer targets", () => {
      assertRolesEqual(getReassignRoleOptions("co_owner", "contractor"), ["contractor", "viewer"]);
      assertRolesEqual(getReassignRoleOptions("co_owner", "viewer"), ["contractor", "viewer"]);
      assertRolesEqual(getReassignRoleOptions("co_owner", "co_owner"), []);
    });

    it("contractor/viewer cannot reassign", () => {
      assertRolesEqual(getReassignRoleOptions("contractor", "contractor"), []);
      assertRolesEqual(getReassignRoleOptions("viewer", "viewer"), []);
    });
  });

  describe("getInviteAiAccessOptions", () => {
    it("none restricts to none", () => {
      assertAiEqual(getInviteAiAccessOptions("none"), ["none"]);
    });

    it("consult_only restricts to none/consult_only", () => {
      assertAiEqual(getInviteAiAccessOptions("consult_only"), ["none", "consult_only"]);
    });

    it("project_pool allows all", () => {
      assertAiEqual(getInviteAiAccessOptions("project_pool"), ["none", "consult_only", "project_pool"]);
    });
  });

  describe("finance visibility defaults", () => {
    it("keeps viewer and contractor fail-safe by default", () => {
      expect(getDefaultFinanceVisibility("viewer")).toBe("none");
      expect(getDefaultFinanceVisibility("contractor")).toBe("none");
    });

    it("keeps co_owner and owner on detail defaults", () => {
      expect(getDefaultFinanceVisibility("co_owner")).toBe("detail");
      expect(getDefaultFinanceVisibility("owner")).toBe("detail");
    });
  });

  describe("internal docs & media copy", () => {
    it("labels resolve to distinct i18n keys for none/view/edit", () => {
      expect(internalDocsVisibilityLabels.none).toBe("participants.internalDocs.none");
      expect(internalDocsVisibilityLabels.view).toBe("participants.internalDocs.view");
      expect(internalDocsVisibilityLabels.edit).toBe("participants.internalDocs.edit");
    });

    it("permission summary includes the internal docs & media line", () => {
      const summary = describePermissionSummary({
        role: "contractor",
        aiAccess: "none",
        internalDocsVisibility: "view",
        creditLimit: 0,
      }, t);
      const docsLine = summary.find((l) => l.startsWith("participants.summary.internalDocs"));
      expect(docsLine).toContain("participants.internalDocs.view");
    });

    it("edit warning produces the docs-edit key", () => {
      const warnings = getPermissionWarnings({
        role: "contractor",
        aiAccess: "none",
        internalDocsVisibility: "edit",
        creditLimit: 0,
      }, t);
      expect(warnings).toContain("participants.warning.docsEdit");
    });
  });

  describe("non-standard supported access summary", () => {
    it("flags non-default finance expansion for viewer and contractor", () => {
      expect(hasNonStandardSupportedAccess({ role: "viewer", financeVisibility: "summary" })).toBe(true);
      expect(hasNonStandardSupportedAccess({ role: "contractor", financeVisibility: "summary" })).toBe(true);
    });

    it("returns the expected i18n keys for the non-standard access summary", () => {
      const viewerSummary = getNonStandardAccessSummary({ role: "viewer", financeVisibility: "summary" }, t);
      expect(viewerSummary?.title).toBe("participants.nonStandard.viewer.title");
      expect(viewerSummary?.lines).toEqual(["participants.nonStandard.viewer.line1"]);

      const contractorSummary = getNonStandardAccessSummary({ role: "contractor", financeVisibility: "summary" }, t);
      expect(contractorSummary?.title).toBe("participants.nonStandard.contractor.title");
      expect(contractorSummary?.lines).toEqual(["participants.nonStandard.contractor.line1"]);
    });
  });
});
