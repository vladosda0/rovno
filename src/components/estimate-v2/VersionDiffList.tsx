import { useMemo, useState } from "react";
import type { EstimateV2StructuredChange, Regime, ResourceLineType } from "@/types/estimate-v2";

interface VersionDiffListProps {
  changes: EstimateV2StructuredChange[];
  regime: Regime;
  currency: string;
  compactLimit?: number;
  showSensitiveDetail?: boolean;
}

interface WorkGroup {
  key: string;
  order: number;
  label: string;
  changes: EstimateV2StructuredChange[];
}

interface StageGroup {
  key: string;
  order: number;
  label: string;
  stageChanges: EstimateV2StructuredChange[];
  works: Map<string, WorkGroup>;
}

const TYPE_LABEL: Record<ResourceLineType, string> = {
  material: "material",
  tool: "tool",
  labor: "labor",
  subcontractor: "subcontractor",
  other: "other",
};

function changeTypeLabel(type: EstimateV2StructuredChange["changeType"]): string {
  if (type === "added") return "added";
  if (type === "removed") return "removed";
  return "edited";
}

function isSensitiveField(field: string): boolean {
  return field === "costUnitCents" || field === "markupBps" || field === "discountBpsOverride";
}

function shouldShowField(field: string, regime: Regime, showSensitiveDetail: boolean): boolean {
  if (!showSensitiveDetail && isSensitiveField(field)) return false;
  if (regime === "client") {
    if (isSensitiveField(field)) return false;
  }
  if (regime === "build_myself" && field === "markupBps") return false;
  return true;
}

function formatQty(value: unknown): string {
  if (typeof value !== "number") return String(value ?? "—");
  return (value / 1000).toString();
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatFieldValue(field: string, value: unknown, currency: string): string {
  if (value == null) return "—";
  if (field === "qtyMilli") return formatQty(value);
  if (field === "costUnitCents" || field === "clientUnitCents" || field === "clientTotalCents") {
    return typeof value === "number" ? money(value, currency) : String(value);
  }
  if (field === "markupBps" || field === "discountBpsOverride") {
    return typeof value === "number" ? `${value / 100}%` : String(value);
  }
  if (field === "type") {
    return typeof value === "string" ? (TYPE_LABEL[value as ResourceLineType] ?? value) : String(value);
  }
  return String(value);
}

function formatStageLabel(change: EstimateV2StructuredChange): string {
  if (change.stageNumber != null && change.stageTitle) return `Stage ${change.stageNumber}: ${change.stageTitle}`;
  if (change.stageNumber != null) return `Stage ${change.stageNumber}`;
  if (change.stageTitle) return `Stage: ${change.stageTitle}`;
  return "Stage";
}

function formatWorkLabel(change: EstimateV2StructuredChange): string {
  if (change.workNumber && change.workTitle) return `Work ${change.workNumber}: ${change.workTitle}`;
  if (change.workNumber) return `Work ${change.workNumber}`;
  if (change.workTitle) return `Work: ${change.workTitle}`;
  return "Work";
}

function workOrder(workNumber: string | null): number {
  if (!workNumber) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(workNumber.split(".")[1]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function VersionDiffList({
  changes,
  regime,
  currency,
  compactLimit = 12,
  showSensitiveDetail = true,
}: VersionDiffListProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? changes : changes.slice(0, compactLimit);

  const grouped = useMemo(() => {
    const stages = new Map<string, StageGroup>();

    visible.forEach((change) => {
      const stageKey = change.stageId ?? "__no-stage";
      if (!stages.has(stageKey)) {
        stages.set(stageKey, {
          key: stageKey,
          order: change.stageNumber ?? Number.MAX_SAFE_INTEGER,
          label: formatStageLabel(change),
          stageChanges: [],
          works: new Map(),
        });
      }
      const stage = stages.get(stageKey)!;
      if (change.entityKind === "stage") {
        stage.stageChanges.push(change);
        return;
      }

      const workKey = change.workId ?? "__no-work";
      if (!stage.works.has(workKey)) {
        stage.works.set(workKey, {
          key: workKey,
          order: workOrder(change.workNumber),
          label: formatWorkLabel(change),
          changes: [],
        });
      }
      stage.works.get(workKey)!.changes.push(change);
    });

    return [...stages.values()].sort((a, b) => a.order - b.order);
  }, [visible]);

  if (changes.length === 0) {
    return <p className="text-caption text-muted-foreground">No detected changes.</p>;
  }

  return (
    <div className="space-y-3">
      {grouped.map((stage) => (
        <div key={stage.key} className="space-y-2">
          <p className="text-caption font-semibold text-foreground">{stage.label}</p>

          {stage.stageChanges.map((change) => (
            <div key={`${change.entityKind}-${change.entityId}`} className="rounded-md border border-border/70 px-2 py-1.5">
              <p className="text-caption text-foreground">
                {change.title} ({changeTypeLabel(change.changeType)})
              </p>
              {change.fieldChanges.filter((field) => shouldShowField(field.field, regime, showSensitiveDetail)).length > 0 && (
                <p className="text-caption text-muted-foreground">
                  {change.fieldChanges
                    .filter((field) => shouldShowField(field.field, regime, showSensitiveDetail))
                    .map((field) => `${field.label} changed ${formatFieldValue(field.field, field.before, currency)} → ${formatFieldValue(field.field, field.after, currency)}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          ))}

          {[...stage.works.values()].sort((a, b) => a.order - b.order).map((work) => (
            <div key={work.key} className="space-y-1 pl-3">
              <p className="text-caption font-medium text-foreground">{work.label}</p>
              {work.changes.map((change) => (
                <div key={`${change.entityKind}-${change.entityId}`} className="rounded-md border border-border/70 px-2 py-1.5">
                  <p className="text-caption text-foreground">
                    {change.entityKind === "line" ? `Resource: ${change.title}` : change.title} ({changeTypeLabel(change.changeType)})
                  </p>
                  {change.fieldChanges.filter((field) => shouldShowField(field.field, regime, showSensitiveDetail)).length > 0 && (
                    <p className="text-caption text-muted-foreground">
                      {change.fieldChanges
                        .filter((field) => shouldShowField(field.field, regime, showSensitiveDetail))
                        .map((field) => `${field.label} changed ${formatFieldValue(field.field, field.before, currency)} → ${formatFieldValue(field.field, field.after, currency)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {changes.length > compactLimit && (
        <button
          type="button"
          className="text-caption text-accent hover:underline"
          onClick={() => setShowAll((prev) => !prev)}
        >
          {showAll ? "Show less" : `Show all (${changes.length})`}
        </button>
      )}
    </div>
  );
}
