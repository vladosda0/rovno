import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { resourceLineSemanticLabel } from "@/lib/estimate-v2/resource-type-contract";
import type { EstimateV2StructuredChange, ProjectMode, ResourceLineType } from "@/types/estimate-v2";

interface VersionDiffListProps {
  changes: EstimateV2StructuredChange[];
  projectMode: ProjectMode;
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

type Translator = (key: string, options?: Record<string, unknown>) => string;

function changeTypeKey(type: EstimateV2StructuredChange["changeType"]): string {
  if (type === "added") return "estimate.diff.change.added";
  if (type === "removed") return "estimate.diff.change.removed";
  return "estimate.diff.change.edited";
}

function isSensitiveField(field: string): boolean {
  return field === "costUnitCents" || field === "markupBps" || field === "discountBpsOverride";
}

function shouldShowField(field: string, projectMode: ProjectMode, showSensitiveDetail: boolean): boolean {
  if (!showSensitiveDetail && isSensitiveField(field)) return false;
  if (projectMode === "build_myself" && field === "markupBps") return false;
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

function formatFieldValue(field: string, value: unknown, currency: string, t: Translator): string {
  if (value == null) return "—";
  if (field === "qtyMilli") return formatQty(value);
  if (field === "costUnitCents" || field === "clientUnitCents" || field === "clientTotalCents") {
    return typeof value === "number" ? money(value, currency) : String(value);
  }
  if (field === "markupBps" || field === "discountBpsOverride") {
    return typeof value === "number" ? `${value / 100}%` : String(value);
  }
  if (field === "type") {
    return typeof value === "string" ? (t(resourceLineSemanticLabel(value as ResourceLineType)) ?? value) : String(value);
  }
  return String(value);
}

function formatStageLabel(change: EstimateV2StructuredChange, t: Translator): string {
  if (change.stageNumber != null && change.stageTitle) {
    return t("estimate.diff.stage.numbered", { number: change.stageNumber, title: change.stageTitle });
  }
  if (change.stageNumber != null) {
    return t("estimate.diff.stage.numberOnly", { number: change.stageNumber });
  }
  if (change.stageTitle) {
    return t("estimate.diff.stage.titleOnly", { title: change.stageTitle });
  }
  return t("estimate.diff.stage.generic");
}

function formatWorkLabel(change: EstimateV2StructuredChange, t: Translator): string {
  if (change.workNumber && change.workTitle) {
    return t("estimate.diff.work.numbered", { number: change.workNumber, title: change.workTitle });
  }
  if (change.workNumber) {
    return t("estimate.diff.work.numberOnly", { number: change.workNumber });
  }
  if (change.workTitle) {
    return t("estimate.diff.work.titleOnly", { title: change.workTitle });
  }
  return t("estimate.diff.work.generic");
}

function workOrder(workNumber: string | null): number {
  if (!workNumber) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(workNumber.split(".")[1]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function VersionDiffList({
  changes,
  projectMode,
  currency,
  compactLimit = 12,
  showSensitiveDetail = true,
}: VersionDiffListProps) {
  const { t } = useTranslation();
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
          label: formatStageLabel(change, t),
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
          label: formatWorkLabel(change, t),
          changes: [],
        });
      }
      stage.works.get(workKey)!.changes.push(change);
    });

    return [...stages.values()].sort((a, b) => a.order - b.order);
  }, [t, visible]);

  if (changes.length === 0) {
    return <p className="text-caption text-muted-foreground">{t("estimate.diff.noChanges")}</p>;
  }

  return (
    <div className="space-y-3">
      {grouped.map((stage) => (
        <div key={stage.key} className="space-y-2">
          <p className="text-caption font-semibold text-foreground">{stage.label}</p>

          {stage.stageChanges.map((change) => (
            <div key={`${change.entityKind}-${change.entityId}`} className="rounded-md border border-border/70 px-2 py-1.5">
              <p className="text-caption text-foreground">
                {change.title} ({t(changeTypeKey(change.changeType))})
              </p>
              {change.fieldChanges.filter((field) => shouldShowField(field.field, projectMode, showSensitiveDetail)).length > 0 && (
                <p className="text-caption text-muted-foreground">
                  {change.fieldChanges
                    .filter((field) => shouldShowField(field.field, projectMode, showSensitiveDetail))
                    .map((field) => t("estimate.diff.fieldChanged", {
                      label: field.label,
                      before: formatFieldValue(field.field, field.before, currency, t),
                      after: formatFieldValue(field.field, field.after, currency, t),
                    }))
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
                    {change.entityKind === "line"
                      ? t("estimate.diff.lineTitle", { title: change.title })
                      : change.title} ({t(changeTypeKey(change.changeType))})
                  </p>
                  {change.fieldChanges.filter((field) => shouldShowField(field.field, projectMode, showSensitiveDetail)).length > 0 && (
                    <p className="text-caption text-muted-foreground">
                      {change.fieldChanges
                        .filter((field) => shouldShowField(field.field, projectMode, showSensitiveDetail))
                        .map((field) => t("estimate.diff.fieldChanged", {
                          label: field.label,
                          before: formatFieldValue(field.field, field.before, currency, t),
                          after: formatFieldValue(field.field, field.after, currency, t),
                        }))
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
          {showAll ? t("estimate.diff.showLess") : t("estimate.diff.showAll", { count: changes.length })}
        </button>
      )}
    </div>
  );
}
