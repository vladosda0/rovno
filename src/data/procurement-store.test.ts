import { describe, expect, it } from "vitest";
import {
  addProcurementItem,
  getProcurementItemById,
  syncFromEstimate,
} from "@/data/procurement-store";

function createEstimateItem(params: {
  id: string;
  projectId: string;
  stageId: string;
  itemName: string;
  qty: number;
  unit: string;
  planned: number;
}) {
  return {
    id: params.id,
    projectId: params.projectId,
    stageId: params.stageId,
    sourceType: "MANUAL" as const,
    sourceId: null,
    itemName: params.itemName,
    originalName: params.itemName,
    isNameOverridden: false,
    type: "material" as const,
    qty: params.qty,
    unit: params.unit,
    planned: params.planned,
    paid: 0,
    receipts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("procurement-store estimate sync", () => {
  it("matches estimate-linked requests by stable source ID before matching key", () => {
    const projectId = `sync-source-project-${Date.now()}`;
    const stageId = `stage-${Date.now()}`;
    const sourceEstimateItemId = `sei-${Date.now()}`;
    const item = addProcurementItem({
      id: `proc-source-${Date.now()}`,
      projectId,
      stageId,
      categoryId: null,
      type: "material",
      name: "Initial request name",
      spec: null,
      unit: "kg",
      requiredByDate: null,
      requiredQty: 5,
      orderedQty: 0,
      receivedQty: 0,
      plannedUnitPrice: 10,
      actualUnitPrice: null,
      supplier: null,
      supplierPreferred: null,
      locationPreferredId: null,
      lockedFromEstimate: false,
      sourceEstimateItemId,
      linkUrl: null,
      notes: null,
      attachments: [],
      createdFrom: "estimate",
      linkedTaskIds: [],
      archived: false,
    });

    syncFromEstimate(projectId, stageId, [
      createEstimateItem({
        id: sourceEstimateItemId,
        projectId,
        stageId,
        itemName: "Renamed estimate material",
        qty: 8,
        unit: "pcs",
        planned: 160,
      }),
    ]);

    const synced = getProcurementItemById(item.id);
    expect(synced?.requiredQty).toBe(8);
    expect(synced?.plannedUnitPrice).toBe(20);
    expect(synced?.sourceEstimateItemId).toBe(sourceEstimateItemId);
  });

  it("does not overwrite qty or planned price when estimate-linked request is locked", () => {
    const projectId = `sync-locked-project-${Date.now()}`;
    const stageId = `stage-${Date.now()}`;
    const sourceEstimateItemId = `sei-${Date.now()}`;
    const item = addProcurementItem({
      id: `proc-locked-${Date.now()}`,
      projectId,
      stageId,
      categoryId: null,
      type: "material",
      name: "Locked request",
      spec: null,
      unit: "pcs",
      requiredByDate: null,
      requiredQty: 3,
      orderedQty: 0,
      receivedQty: 0,
      plannedUnitPrice: 120,
      actualUnitPrice: null,
      supplier: null,
      supplierPreferred: null,
      locationPreferredId: null,
      lockedFromEstimate: true,
      sourceEstimateItemId,
      linkUrl: null,
      notes: null,
      attachments: [],
      createdFrom: "estimate",
      linkedTaskIds: [],
      archived: false,
    });

    syncFromEstimate(projectId, stageId, [
      createEstimateItem({
        id: sourceEstimateItemId,
        projectId,
        stageId,
        itemName: "Locked request changed in estimate",
        qty: 10,
        unit: "pcs",
        planned: 1000,
      }),
    ]);

    const synced = getProcurementItemById(item.id);
    expect(synced?.requiredQty).toBe(3);
    expect(synced?.plannedUnitPrice).toBe(120);
    expect(synced?.sourceEstimateItemId).toBe(sourceEstimateItemId);
  });
});
