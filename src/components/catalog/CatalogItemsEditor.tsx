import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ResourceLineType } from "@/types/estimate-v2";
import type { RowIssue, RowSeverity } from "@/types/user-catalog";
import {
  CUSTOM_UNIT_SENTINEL,
  buildUnitSelectOptions,
  resolveUnitSelectValue,
} from "@/lib/estimate-v2/resource-units";
import { RESOURCE_TYPE_VALUES } from "@/lib/user-catalog/validation";
import {
  ArticleMatchCombobox,
  type MatchedArticle,
} from "@/components/catalog/ArticleMatchCombobox";

/** Presentation row — pages map draft rows or saved items into this shape. */
export interface EditorRowData {
  id: string;
  name: string;
  unit: string;
  priceInput: string;
  resourceType: ResourceLineType;
  typeAutoFilled: boolean;
  supplierSku: string;
  matchedArticleId: string | null;
  matchedArticleName: string | null;
  sourceRowNumber: number | null;
  issues: RowIssue[];
  severity: RowSeverity;
}

export type EditorRowPatch = Partial<
  Pick<
    EditorRowData,
    | "name"
    | "unit"
    | "priceInput"
    | "resourceType"
    | "typeAutoFilled"
    | "supplierSku"
    | "matchedArticleId"
    | "matchedArticleName"
  >
>;

interface CatalogItemsEditorProps {
  rows: EditorRowData[];
  onRowChange: (id: string, patch: EditorRowPatch) => void;
  onRowDelete: (id: string) => void;
  onAddRow: () => void;
  /** Gates the "Артикул Rovno" search (needs a Supabase session). */
  matchSearchEnabled: boolean;
  disabled?: boolean;
}

const PAGE_SIZE = 50;

type SeverityFilter = "all" | "blocking" | "warning";

function severityRowClass(severity: RowSeverity): string {
  // Both tiers use the brand orange (--warning === --destructive in the
  // design system); blocking rows are distinguished by intensity + the lock
  // icon + a stronger left bar (spec R-4: "подсвечены отличным способом").
  if (severity === "blocking") return "border-l-4 border-l-destructive bg-destructive/10";
  if (severity === "warning") return "border-l-4 border-l-warning/60 bg-warning/5";
  return "border-l-4 border-l-transparent";
}

/**
 * Inline-editable price-list table shared by the upload-review page (draft
 * mode) and the saved-catalog page. Fully controlled: parents own the rows
 * and re-validate on each patch (see lib/user-catalog/validation.ts).
 */
export function CatalogItemsEditor({
  rows,
  onRowChange,
  onRowDelete,
  onAddRow,
  matchSearchEnabled,
  disabled = false,
}: CatalogItemsEditorProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [page, setPage] = useState(0);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "blocking") return rows.filter((row) => row.severity === "blocking");
    return rows.filter((row) => row.severity === "warning");
  }, [rows, filter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filteredRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const blockingCount = rows.filter((row) => row.severity === "blocking").length;
  const warningCount = rows.filter((row) => row.severity === "warning").length;

  const filterChips: Array<{ key: SeverityFilter; label: string; count: number | null }> = [
    { key: "all", label: t("catalogEditor.filter.all"), count: rows.length },
    { key: "blocking", label: t("catalogEditor.filter.blocking"), count: blockingCount },
    { key: "warning", label: t("catalogEditor.filter.warning"), count: warningCount },
  ];

  const setFilterAndReset = (next: SeverityFilter) => {
    setFilter(next);
    setPage(0);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => setFilterAndReset(chip.key)}
            className={cn(
              "rounded-pill border px-2.5 py-1 text-caption transition-colors",
              filter === chip.key
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
              chip.key === "blocking" && chip.count === 0 && "opacity-50",
            )}
          >
            {chip.label}
            {chip.count !== null && (
              <span className="ml-1 tabular-nums">{chip.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-panel border border-border bg-card">
        <Table className="min-w-[880px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-right">№</TableHead>
              <TableHead className="min-w-[220px]">{t("catalogEditor.columns.name")}</TableHead>
              <TableHead className="w-36">{t("catalogEditor.columns.unit")}</TableHead>
              <TableHead className="w-28">{t("catalogEditor.columns.price")}</TableHead>
              <TableHead className="w-36">{t("catalogEditor.columns.type")}</TableHead>
              <TableHead className="w-32">{t("catalogEditor.columns.sku")}</TableHead>
              <TableHead className="w-48">{t("catalogEditor.columns.match")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  {t("catalogEditor.emptyFiltered")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <EditorRow
                  key={row.id}
                  row={row}
                  disabled={disabled}
                  matchSearchEnabled={matchSearchEnabled}
                  onChange={(patch) => onRowChange(row.id, patch)}
                  onDelete={() => onRowDelete(row.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddRow}
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t("catalogEditor.addRow")}
        </Button>

        {pageCount > 1 && (
          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              {t("catalogEditor.prevPage")}
            </Button>
            <span className="tabular-nums">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              {t("catalogEditor.nextPage")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditorRow({
  row,
  disabled,
  matchSearchEnabled,
  onChange,
  onDelete,
}: {
  row: EditorRowData;
  disabled: boolean;
  matchSearchEnabled: boolean;
  onChange: (patch: EditorRowPatch) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  const unitSelectValue = resolveUnitSelectValue(row.resourceType, row.unit);
  const unitOptions = buildUnitSelectOptions(row.resourceType, t);
  const isCustomUnit = unitSelectValue === CUSTOM_UNIT_SENTINEL;

  const hintIssues = row.issues;

  const handleMatchSelect = (article: MatchedArticle | null) => {
    onChange(
      article
        ? { matchedArticleId: article.id, matchedArticleName: article.name }
        : { matchedArticleId: null, matchedArticleName: null },
    );
  };

  return (
    <>
      <TableRow className={cn(severityRowClass(row.severity), hintIssues.length > 0 && "border-b-0")}>
        <TableCell className="py-1.5 text-right align-top text-caption tabular-nums text-muted-foreground">
          <span className="inline-flex items-center gap-1 pt-2">
            {row.severity === "blocking" && (
              <Lock className="h-3 w-3 text-destructive" aria-hidden="true" />
            )}
            {row.sourceRowNumber ?? "+"}
          </span>
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <Input
            value={row.name}
            disabled={disabled}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder={t("catalogEditor.namePlaceholder")}
            className="h-8"
          />
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <div className="space-y-1">
            <Select
              value={unitSelectValue}
              disabled={disabled}
              onValueChange={(value) => {
                // Switching to "Своя единица" clears the token; the custom
                // input below takes over.
                onChange({ unit: value === CUSTOM_UNIT_SENTINEL ? "" : value });
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustomUnit && (
              <Input
                value={row.unit}
                disabled={disabled}
                onChange={(event) => onChange({ unit: event.target.value })}
                placeholder={t("catalogEditor.customUnitPlaceholder")}
                className="h-7 text-xs"
                maxLength={50}
              />
            )}
          </div>
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <Input
            value={row.priceInput}
            disabled={disabled}
            inputMode="decimal"
            onChange={(event) => onChange({ priceInput: event.target.value })}
            placeholder="0"
            className="h-8 text-right tabular-nums"
          />
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <div className="space-y-0.5">
            <Select
              value={row.resourceType}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({ resourceType: value as ResourceLineType, typeAutoFilled: false })
              }
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOURCE_TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`estimate.resource.type.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.typeAutoFilled && (
              <p className="text-[11px] italic text-muted-foreground">
                {t("catalogEditor.typeAutoFilled")}
              </p>
            )}
          </div>
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <Input
            value={row.supplierSku}
            disabled={disabled}
            onChange={(event) => onChange({ supplierSku: event.target.value })}
            className="h-8"
            maxLength={100}
          />
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <ArticleMatchCombobox
            matchedArticleId={row.matchedArticleId}
            matchedArticleName={row.matchedArticleName}
            seedQuery={row.name}
            onSelect={handleMatchSelect}
            disabled={disabled || !matchSearchEnabled}
          />
        </TableCell>
        <TableCell className="py-1.5 align-top">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={onDelete}
            aria-label={t("catalogEditor.deleteRow")}
          >
            <X className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {hintIssues.length > 0 && (
        <TableRow className={cn(severityRowClass(row.severity), "hover:bg-transparent")}>
          <TableCell colSpan={8} className="pb-2 pt-0">
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 pl-1">
              {hintIssues.map((issue) => (
                <span
                  key={`${issue.code}:${issue.field}`}
                  className={cn(
                    "text-caption",
                    issue.severity === "blocking" ? "text-destructive" : "text-warning",
                  )}
                >
                  {t(`catalogIssues.${issue.code}`)}
                </span>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
