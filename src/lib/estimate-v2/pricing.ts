import type {
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  Regime,
  ResourceLineType,
} from "@/types/estimate-v2";

export interface ComputedLineTotals {
  lineId: string;
  type: ResourceLineType;
  costTotalCents: number;
  preDiscountTotalCents: number;
  clientUnitCents: number;
  clientTotalCents: number;
  marginCents: number;
  markupCents: number;
  discountCents: number;
}

export interface ProjectTotals {
  subtotalCents: number;
  taxAmountCents: number;
  totalCents: number;
  costTotalCents: number;
  markupTotalCents: number;
  discountTotalCents: number;
  breakdownByType: Record<ResourceLineType, number>;
}

export interface StageSubtotal {
  stageId: string;
  subtotalCents: number;
}

const BPS_BASE = 10_000;
const QTY_MILLI_BASE = 1_000;

function clampBps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(BPS_BASE, Math.round(value)));
}

export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.floor((abs + denominator / 2) / denominator);
}

function multiplyBps(value: number, bps: number): number {
  return roundHalfUpDiv(value * bps, BPS_BASE);
}

function multiplyQtyMilli(valueCents: number, qtyMilli: number): number {
  return roundHalfUpDiv(valueCents * qtyMilli, QTY_MILLI_BASE);
}

export function computeEffectiveDiscountBps(
  line: Pick<EstimateV2ResourceLine, "discountBpsOverride">,
  stage: Pick<EstimateV2Stage, "discountBps">,
  project: Pick<EstimateV2Project, "discountBps">,
): number {
  if (line.discountBpsOverride != null) {
    return clampBps(line.discountBpsOverride);
  }
  if (stage.discountBps > 0) {
    return clampBps(stage.discountBps);
  }
  return clampBps(project.discountBps);
}

export function computeClientUnitCents(
  costUnitCents: number,
  markupBps: number,
  discountBps: number,
): number {
  const markedUp = costUnitCents + multiplyBps(costUnitCents, clampBps(markupBps));
  const discountAmount = multiplyBps(markedUp, clampBps(discountBps));
  return Math.max(markedUp - discountAmount, 0);
}

export function computeLineTotals(
  line: EstimateV2ResourceLine,
  stage: EstimateV2Stage,
  project: EstimateV2Project,
  regime: Regime,
): ComputedLineTotals {
  const qtyMilli = Math.max(0, Math.round(line.qtyMilli));
  const effectiveDiscountBps = computeEffectiveDiscountBps(line, stage, project);
  const effectiveMarkupBps = regime === "build_myself" ? 0 : clampBps(line.markupBps);

  const costTotalCents = multiplyQtyMilli(line.costUnitCents, qtyMilli);
  const preDiscountUnitCents = line.costUnitCents + multiplyBps(line.costUnitCents, effectiveMarkupBps);
  const preDiscountTotalCents = multiplyQtyMilli(preDiscountUnitCents, qtyMilli);
  const clientUnitCents = computeClientUnitCents(line.costUnitCents, effectiveMarkupBps, effectiveDiscountBps);
  const clientTotalCents = multiplyQtyMilli(clientUnitCents, qtyMilli);

  return {
    lineId: line.id,
    type: line.type,
    costTotalCents,
    preDiscountTotalCents,
    clientUnitCents,
    clientTotalCents,
    marginCents: clientTotalCents - costTotalCents,
    markupCents: preDiscountTotalCents - costTotalCents,
    discountCents: preDiscountTotalCents - clientTotalCents,
  };
}

export function computeProjectTotals(
  project: EstimateV2Project,
  stages: EstimateV2Stage[],
  _works: unknown[],
  lines: EstimateV2ResourceLine[],
  regime: Regime,
): ProjectTotals {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  const breakdownByType: Record<ResourceLineType, number> = {
    material: 0,
    tool: 0,
    labor: 0,
    subcontractor: 0,
    other: 0,
  };

  let subtotalCents = 0;
  let costTotalCents = 0;
  let markupTotalCents = 0;
  let discountTotalCents = 0;

  lines.forEach((line) => {
    const stage = stageById.get(line.stageId);
    if (!stage) return;

    const totals = computeLineTotals(line, stage, project, regime);
    subtotalCents += totals.clientTotalCents;
    costTotalCents += totals.costTotalCents;
    markupTotalCents += totals.markupCents;
    discountTotalCents += totals.discountCents;
    breakdownByType[line.type] += totals.costTotalCents;
  });

  const taxAmountCents = multiplyBps(subtotalCents, clampBps(project.taxBps));
  return {
    subtotalCents,
    taxAmountCents,
    totalCents: subtotalCents + taxAmountCents,
    costTotalCents,
    markupTotalCents,
    discountTotalCents,
    breakdownByType,
  };
}

export function computeStageSubtotals(
  project: EstimateV2Project,
  stages: EstimateV2Stage[],
  lines: EstimateV2ResourceLine[],
  regime: Regime,
): StageSubtotal[] {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const subtotalByStageId = new Map<string, number>();

  lines.forEach((line) => {
    const stage = stageById.get(line.stageId);
    if (!stage) return;
    const totals = computeLineTotals(line, stage, project, regime);
    subtotalByStageId.set(line.stageId, (subtotalByStageId.get(line.stageId) ?? 0) + totals.clientTotalCents);
  });

  return stages.map((stage) => ({
    stageId: stage.id,
    subtotalCents: subtotalByStageId.get(stage.id) ?? 0,
  }));
}

export function applyLastLineAdjustment(
  linesComputed: ComputedLineTotals[],
  targetTotalCents: number,
): ComputedLineTotals[] {
  if (linesComputed.length === 0) return linesComputed;

  const currentTotal = linesComputed.reduce((sum, line) => sum + line.clientTotalCents, 0);
  const delta = targetTotalCents - currentTotal;
  if (delta === 0) return linesComputed;

  const next = linesComputed.map((line) => ({ ...line }));
  const last = next[next.length - 1];
  last.clientTotalCents += delta;
  last.marginCents += delta;
  return next;
}
