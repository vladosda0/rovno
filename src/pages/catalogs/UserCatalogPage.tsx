import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, PackageOpen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import {
  useAddUserCatalogItem,
  useDeleteUserCatalog,
  useDeleteUserCatalogItem,
  useMatchedArticleNames,
  useRenameUserCatalog,
  useUpdateUserCatalogItem,
  useUserCatalog,
  useUserCatalogItems,
} from "@/hooks/use-user-catalogs";
import {
  CatalogItemsEditor,
  type EditorRowData,
  type EditorRowPatch,
} from "@/components/catalog/CatalogItemsEditor";
import {
  countBySeverity,
  editDraftRow,
  formatCentsAsPriceInput,
  parsePriceInputToCents,
  removeDraftRow,
} from "@/lib/user-catalog/validation";
import type { DraftRow } from "@/types/user-catalog";
import { trackEvent } from "@/lib/analytics";

const CATALOGS_TAB_URL = "/home?tab=documents&docTab=catalogs";
const NEW_ROW_PREFIX = "new-";
const FLUSH_DELAY_MS = 600;

/**
 * Saved-catalog page (US-9): view and edit the rows of one personal catalog,
 * rename it, delete it. Edits reuse the DraftRow validation machinery from
 * the upload review; valid changes flush to the DB debounced, rows with
 * blocking issues stay local (and highlighted) until fixed.
 */
export default function UserCatalogPage() {
  const { catalogId } = useParams<{ catalogId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  const isSupabaseMode = workspaceMode.kind === "supabase";

  const catalogQuery = useUserCatalog(catalogId, isSupabaseMode);
  const itemsQuery = useUserCatalogItems(catalogId, isSupabaseMode);

  const renameMutation = useRenameUserCatalog();
  const deleteCatalogMutation = useDeleteUserCatalog();
  const updateItemMutation = useUpdateUserCatalogItem();
  const addItemMutation = useAddUserCatalogItem();
  const deleteItemMutation = useDeleteUserCatalogItem();

  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [deleteCatalogOpen, setDeleteCatalogOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState<DraftRow | null>(null);

  const dirtyIds = useRef(new Set<string>());
  const flushTimer = useRef<number | null>(null);
  const maxPosition = useRef(0);

  const matchedIds = useMemo(
    () => (rows ?? []).map((row) => row.matchedArticleId).filter((id): id is string => Boolean(id)),
    [rows],
  );
  const articleNamesQuery = useMatchedArticleNames(matchedIds, isSupabaseMode);

  // Seed local rows once per catalog load; afterwards local state is the
  // source of truth (the flush keeps the server in sync).
  useEffect(() => {
    if (!itemsQuery.data || rows !== null) return;
    maxPosition.current = itemsQuery.data.reduce((max, item) => Math.max(max, item.position), 0);
    const seeded: DraftRow[] = itemsQuery.data.map((item, index) => ({
      localId: item.id,
      name: item.name,
      unit: item.unit,
      priceInput: formatCentsAsPriceInput(item.priceCents),
      resourceType: item.resourceType,
      typeAutoFilled: false,
      supplierSku: item.supplierSku ?? "",
      matchedArticleId: item.matchedArticleId,
      matchedArticleName: null,
      sourceRowNumber: index + 1,
      issues: [],
      severity: "ok",
    }));
    setRows(seeded);
  }, [itemsQuery.data, rows]);

  const flushDirtyRows = useCallback(() => {
    if (!rows || !catalogId) return;
    for (const row of rows) {
      if (!dirtyIds.current.has(row.localId)) continue;
      if (row.severity === "blocking") continue; // stays local until fixed
      const priceCents = parsePriceInputToCents(row.priceInput) ?? 0;
      const payload = {
        name: row.name.trim(),
        unit: row.unit.trim(),
        priceCents,
        resourceType: row.resourceType,
        supplierSku: row.supplierSku.trim() || null,
        matchedArticleId: row.matchedArticleId,
      };
      dirtyIds.current.delete(row.localId);
      if (row.localId.startsWith(NEW_ROW_PREFIX)) {
        maxPosition.current += 1;
        addItemMutation.mutate(
          { catalogId, item: payload, position: maxPosition.current },
          {
            onSuccess: (created) => {
              // Swap the local id for the server id so later edits target the row.
              setRows((current) =>
                current
                  ? current.map((r) =>
                      r.localId === row.localId ? { ...r, localId: created.id } : r,
                    )
                  : current,
              );
            },
            onError: () => dirtyIds.current.add(row.localId),
          },
        );
      } else {
        updateItemMutation.mutate(
          { itemId: row.localId, patch: payload },
          { onError: () => dirtyIds.current.add(row.localId) },
        );
      }
    }
  }, [rows, catalogId, addItemMutation, updateItemMutation]);

  useEffect(() => {
    if (!rows || dirtyIds.current.size === 0) return;
    if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    flushTimer.current = window.setTimeout(flushDirtyRows, FLUSH_DELAY_MS);
    return () => {
      if (flushTimer.current !== null) window.clearTimeout(flushTimer.current);
    };
  }, [rows, flushDirtyRows]);

  const editorRows: EditorRowData[] = useMemo(() => {
    if (!rows) return [];
    const names = articleNamesQuery.data;
    return rows.map((row) => ({
      id: row.localId,
      name: row.name,
      unit: row.unit,
      priceInput: row.priceInput,
      resourceType: row.resourceType,
      typeAutoFilled: row.typeAutoFilled,
      supplierSku: row.supplierSku,
      matchedArticleId: row.matchedArticleId,
      matchedArticleName:
        row.matchedArticleName ??
        (row.matchedArticleId ? names?.get(row.matchedArticleId) ?? null : null),
      sourceRowNumber: row.sourceRowNumber,
      issues: row.issues,
      severity: row.severity,
    }));
  }, [rows, articleNamesQuery.data]);

  if (!isSupabaseMode) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center space-y-3">
        <PackageOpen className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">{t("catalogPage.signInRequired")}</p>
        <Button asChild variant="outline">
          <Link to={CATALOGS_TAB_URL}>{t("catalogReview.backToCatalogs")}</Link>
        </Button>
      </div>
    );
  }

  if (catalogQuery.isLoading || itemsQuery.isLoading || rows === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("app.loading")}
      </div>
    );
  }

  const catalog = catalogQuery.data;
  if (!catalog) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center space-y-3">
        <PackageOpen className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-body-sm text-muted-foreground">{t("catalogPage.notFound")}</p>
        <Button asChild variant="outline">
          <Link to={CATALOGS_TAB_URL}>{t("catalogReview.backToCatalogs")}</Link>
        </Button>
      </div>
    );
  }

  const counts = countBySeverity(rows);

  const handleRowChange = (id: string, patch: EditorRowPatch) => {
    dirtyIds.current.add(id);
    trackEvent("catalog_row_edited", { catalog_id: catalog.id, saved: true });
    setRows((current) => (current ? editDraftRow(current, id, patch) : current));
  };

  const handleRowDelete = (id: string) => {
    const row = rows.find((r) => r.localId === id);
    if (!row) return;
    if (id.startsWith(NEW_ROW_PREFIX)) {
      // Never persisted — drop locally without confirmation.
      dirtyIds.current.delete(id);
      setRows((current) => (current ? removeDraftRow(current, id) : current));
      return;
    }
    setRowPendingDelete(row);
  };

  const confirmRowDelete = () => {
    const row = rowPendingDelete;
    if (!row) return;
    setRowPendingDelete(null);
    dirtyIds.current.delete(row.localId);
    setRows((current) => (current ? removeDraftRow(current, row.localId) : current));
    deleteItemMutation.mutate(row.localId, {
      onError: () => {
        toast({ title: t("catalogPage.deleteRowFailed"), variant: "destructive" });
        setRows((current) => (current ? [...current, row] : current));
      },
    });
  };

  const handleAddRow = () => {
    setRows((current) => {
      if (!current) return current;
      const localId = `${NEW_ROW_PREFIX}${crypto.randomUUID()}`;
      const empty: DraftRow = {
        localId,
        name: "",
        unit: "",
        priceInput: "",
        resourceType: "material",
        typeAutoFilled: false,
        supplierSku: "",
        matchedArticleId: null,
        matchedArticleName: null,
        sourceRowNumber: null,
        issues: [{ code: "NAME_EMPTY", field: "name", severity: "blocking" }],
        severity: "blocking",
      };
      return [...current, empty];
    });
  };

  const commitRename = () => {
    const next = (nameDraft ?? catalog.name).trim();
    setNameDraft(null);
    if (!next || next === catalog.name) return;
    renameMutation.mutate(
      { catalogId: catalog.id, name: next },
      {
        onError: () => toast({ title: t("catalogPage.renameFailed"), variant: "destructive" }),
      },
    );
  };

  const handleDeleteCatalog = () => {
    deleteCatalogMutation.mutate(catalog.id, {
      onSuccess: () => {
        toast({ title: t("catalogPage.deletedToast", { name: catalog.name }) });
        navigate(CATALOGS_TAB_URL, { replace: true });
      },
      onError: () =>
        toast({ title: t("catalogPage.deleteFailed"), variant: "destructive" }),
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            to={CATALOGS_TAB_URL}
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("catalogReview.backToCatalogs")}
          </Link>
          <Input
            value={nameDraft ?? catalog.name}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            className="h-9 max-w-md border-transparent bg-transparent px-1 text-lg font-semibold shadow-none focus-visible:border-input focus-visible:bg-background"
            aria-label={t("catalogPage.renameAria")}
          />
          <p className="text-caption text-muted-foreground">
            {catalog.sourceFilename
              ? t("catalogPage.sourceFile", { file: catalog.sourceFilename })
              : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {t("catalogReview.stats.rows", { count: rows.length })}
          </Badge>
          {counts.blocking > 0 && (
            <Badge className="bg-destructive/15 text-destructive tabular-nums hover:bg-destructive/15">
              {t("catalogReview.stats.blocking", { count: counts.blocking })}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => setDeleteCatalogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("catalogPage.deleteCatalog")}
          </Button>
        </div>
      </div>

      {counts.blocking > 0 && (
        <p className="text-caption text-destructive">{t("catalogPage.blockingHint")}</p>
      )}

      <CatalogItemsEditor
        rows={editorRows}
        onRowChange={handleRowChange}
        onRowDelete={handleRowDelete}
        onAddRow={handleAddRow}
        matchSearchEnabled={isSupabaseMode}
      />

      <ConfirmModal
        open={deleteCatalogOpen}
        onOpenChange={setDeleteCatalogOpen}
        title={t("catalogPage.deleteCatalogTitle", { name: catalog.name })}
        description={t("catalogPage.deleteCatalogBody")}
        confirmLabel={t("common.delete")}
        onConfirm={handleDeleteCatalog}
      />

      <ConfirmModal
        open={rowPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setRowPendingDelete(null);
        }}
        title={t("catalogPage.deleteRowTitle", { name: rowPendingDelete?.name ?? "" })}
        description={t("catalogPage.deleteRowBody")}
        confirmLabel={t("common.delete")}
        onConfirm={confirmRowDelete}
      />
    </div>
  );
}
