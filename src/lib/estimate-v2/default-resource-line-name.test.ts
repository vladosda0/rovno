import { describe, expect, it } from "vitest";
import { buildDefaultResourceLineName, getDefaultResourceLinePrefix } from "@/lib/estimate-v2/default-resource-line-name";
import type { EstimateV2ResourceLine, ResourceLineType } from "@/types/estimate-v2";

function line(
  partial: Partial<EstimateV2ResourceLine> & Pick<EstimateV2ResourceLine, "title" | "type">,
): EstimateV2ResourceLine {
  return {
    id: partial.id ?? partial.title,
    projectId: partial.projectId ?? "project-1",
    stageId: partial.stageId ?? "stage-1",
    workId: partial.workId ?? "work-1",
    title: partial.title,
    type: partial.type,
    unit: partial.unit ?? "unit",
    qtyMilli: partial.qtyMilli ?? 1_000,
    costUnitCents: partial.costUnitCents ?? 0,
    markupBps: partial.markupBps ?? 0,
    discountBpsOverride: partial.discountBpsOverride ?? null,
    assigneeId: partial.assigneeId ?? null,
    assigneeName: partial.assigneeName ?? null,
    assigneeEmail: partial.assigneeEmail ?? null,
    receivedCents: partial.receivedCents ?? 0,
    pnlPlaceholderCents: partial.pnlPlaceholderCents ?? 0,
    createdAt: partial.createdAt ?? "2026-04-09T00:00:00.000Z",
    updatedAt: partial.updatedAt ?? "2026-04-09T00:00:00.000Z",
  };
}

describe("default-resource-line-name", () => {
  describe("getDefaultResourceLinePrefix", () => {
    it.each([
      ["material", "Material"],
      ["tool", "Tool"],
      ["labor", "Labor"],
      ["subcontractor", "Subcontractor"],
      ["other", "Overhead"],
    ] satisfies [ResourceLineType, string][])("maps %s -> %s", (type, expected) => {
      expect(getDefaultResourceLinePrefix(type)).toBe(expected);
    });
  });

  describe("buildDefaultResourceLineName", () => {
    it("starts at 1 when the current work has no matching persisted rows", () => {
      expect(buildDefaultResourceLineName([], "material")).toBe("Material 1");
    });

    it("tracks each resource type independently", () => {
      const lines = [
        line({ title: "Material 2", type: "material" }),
        line({ title: "Tool 4", type: "tool" }),
        line({ title: "Labor 3", type: "labor" }),
        line({ title: "Overhead 5", type: "other" }),
      ];

      expect(buildDefaultResourceLineName(lines, "material")).toBe("Material 3");
      expect(buildDefaultResourceLineName(lines, "tool")).toBe("Tool 5");
      expect(buildDefaultResourceLineName(lines, "labor")).toBe("Labor 4");
      expect(buildDefaultResourceLineName(lines, "other")).toBe("Overhead 6");
    });

    it("ignores rows renamed away from the generated pattern", () => {
      const lines = [
        line({ title: "Material 1", type: "material" }),
        line({ title: "Custom gypsum board", type: "material" }),
      ];

      expect(buildDefaultResourceLineName(lines, "material")).toBe("Material 2");
    });

    it("recomputes from current rows after deletions without historical counters", () => {
      const lines = [
        line({ title: "Material 1", type: "material" }),
        line({ title: "Material 3", type: "material" }),
      ];

      expect(buildDefaultResourceLineName(lines, "material")).toBe("Material 4");
    });

    it("treats exact user-provided generated-style names as occupied", () => {
      const lines = [
        line({ title: "Material 7", type: "material" }),
        line({ title: "Material request", type: "material" }),
      ];

      expect(buildDefaultResourceLineName(lines, "material")).toBe("Material 8");
    });

    it("ignores older generic labels and unrelated formatting", () => {
      const lines = [
        line({ title: "Add resource", type: "material" }),
        line({ title: "New line", type: "material" }),
        line({ title: " Material 9 ", type: "material" }),
      ];

      expect(buildDefaultResourceLineName(lines, "material")).toBe("Material 10");
    });
  });
});
