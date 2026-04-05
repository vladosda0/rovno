import { describe, expect, it } from "vitest";
import { mapProcurementOperationalSummaryToItems } from "@/data/procurement-source";

describe("mapProcurementOperationalSummaryToItems", () => {
  it("maps procurement items and ordered lines without money fields", () => {
    const projectId = "p1";
    const payload = {
      ordered_lines: [
        {
          order_line_id: "ol-1",
          order_id: "o-1",
          order_status: "placed",
          ordered_at: "2026-01-01T00:00:00.000Z",
          delivery_due_at: "2026-01-10T00:00:00.000Z",
          procurement_item_id: "pi-1",
          procurement_item_title: "Cable",
          title: "Cable line",
          quantity: 5,
          unit: "m",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      procurement_items: [
        {
          procurement_item_id: "pi-1",
          estimate_resource_line_id: "erl-1",
          task_id: null,
          title: "Cable",
          description: null,
          category: null,
          quantity: 10,
          unit: "m",
          status: "ordered",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const items = mapProcurementOperationalSummaryToItems(projectId, payload);
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.id).toBe("pi-1");
    expect(item.name).toBe("Cable");
    expect(item.orderedQty).toBe(5);
    expect(item.requiredQty).toBe(10);
    expect(item.plannedUnitPrice).toBeNull();
    expect(item.actualUnitPrice).toBeNull();
    expect(item.sourceEstimateV2LineId).toBe("erl-1");
  });

  it("maps procurement item type from estimate_resource_line_resource_type", () => {
    const projectId = "p1";
    const baseItem = {
      procurement_item_id: "pi-tool",
      estimate_resource_line_id: "erl-tool",
      task_id: null,
      title: "Hammer",
      description: null,
      category: null,
      quantity: 1,
      unit: "pcs",
      status: "ordered",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    const toolPayload = {
      ordered_lines: [] as unknown[],
      procurement_items: [{ ...baseItem, estimate_resource_line_resource_type: "equipment" }],
    };
    const subPayload = {
      ordered_lines: [] as unknown[],
      procurement_items: [{ ...baseItem, procurement_item_id: "pi-sub", estimate_resource_line_id: "erl-sub", estimate_resource_line_resource_type: "subcontractor" }],
    };

    expect(mapProcurementOperationalSummaryToItems(projectId, toolPayload)[0]?.type).toBe("tool");
    expect(mapProcurementOperationalSummaryToItems(projectId, subPayload)[0]?.type).toBe("other");
  });

  it("creates synthetic items for order lines without procurement_item_id", () => {
    const projectId = "p1";
    const payload = {
      ordered_lines: [
        {
          order_line_id: "ol-x",
          order_id: "o-1",
          order_status: "placed",
          ordered_at: null,
          delivery_due_at: null,
          procurement_item_id: null,
          procurement_item_title: null,
          title: "Loose item",
          quantity: 2,
          unit: "pcs",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      procurement_items: [],
    };

    const items = mapProcurementOperationalSummaryToItems(projectId, payload);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("ol-x");
    expect(items[0].name).toBe("Loose item");
    expect(items[0].orderedQty).toBe(2);
    expect(items[0].plannedUnitPrice).toBeNull();
  });
});
