import { describe, expect, it } from "vitest";
import type { AIAccess, MemberRole } from "@/types/entities";
import {
  getInviteAiAccessOptions,
  getInviteRoleOptions,
  getReassignRoleOptions,
} from "@/lib/participant-role-policy";

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

    it("co_owner can assign contractor/viewer only", () => {
      assertRolesEqual(getReassignRoleOptions("co_owner", "contractor"), ["contractor", "viewer"]);
      assertRolesEqual(getReassignRoleOptions("co_owner", "viewer"), ["contractor", "viewer"]);
      assertRolesEqual(getReassignRoleOptions("co_owner", "co_owner"), ["contractor", "viewer"]);
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
});

