import { describe, expect, it } from "vitest";
import { mapInventoryLocationRowToLocation } from "@/data/inventory-source";

describe("inventory-source helpers", () => {
  it("maps inventory locations into the frontend contract with safe defaults", () => {
    expect(mapInventoryLocationRowToLocation({
      id: "location-1",
      project_id: "project-1",
      title: "Warehouse",
      description: null,
      created_at: "2026-03-01T00:00:00.000Z",
    })).toEqual({
      id: "location-1",
      name: "Warehouse",
      address: undefined,
      isDefault: false,
    });
  });
});
