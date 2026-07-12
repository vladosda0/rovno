import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { useSaveUserCatalog } from "@/hooks/use-user-catalogs";
import {
  CatalogItemsEditor,
  type EditorRowData,
  type EditorRowPatch,
} from "@/components/catalog/CatalogItemsEditor";
import {
  loadCatalogDraft,
  removeCatalogDraft,
  saveCatalogDraft,
} from "@/lib/user-catalog/draft-storage";
import {
  appendEmptyDraftRow,
  countBySeverity,
  editDraftRow,
  parsePriceInputToCents,
  removeDraftRow,
} from "@/lib/user-catalog/validation";
import type { CatalogUploadDraft } from "@/types/user-catalog";
import { trackEvent } from "@/lib/analytics";

const CATALOGS_TAB_URL = "/home?tab=documents&docTab=catalogs";

/**
 * Upload-review editor (spec R-5): bookmarkable page where the user fixes
 * parsing issues inline and saves the catalog. The draft lives in
 * localStorage under the :uploadId key — nothing is on the server until
 * "Сохранить каталог" runs the create_user_catalog RPC.
 */
export default function CatalogUploadReview() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  const saveMutation = useSaveUserCatalog();

  const [draft, setDraft] = useState<CatalogUploadDraft | null | "missing">(null);
  const editedRowIds = useRef(new Set<string>());
  const persistTimer = useRef<number | null>(null);
  const pendingDraftRef = useRef<CatalogUploadDraft | null>(null);

  // Catalog-upload funnel: editor opened (observability v1).
  useEffect(() => {
    trackEvent("catalog_editor_opened", { editor: "upload_review" });
  }, []);

  useEffect(() => {
    if (!uploadId) {
      setDraft("missing");
      return;
    }
    setDraft(loadCatalogDraft(uploadId) ?? "missing");
  }, [uploadId]);

  // Debounced persistence: edits keep working from memory even when
  // localStorage is unavailable (private mode / quota).
  useEffect(() => {
    if (!draft || draft === "missing") return;
    pendingDraftRef.current = draft;
    if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      pendingDraftRef.current = null;
      saveCatalogDraft(draft);
    }, 400);
    return () => {
      if (persistTimer.current !== null) window.clearTimeout(persistTimer.current);
    };
  }, [draft]);

  // Unmount flush: edits made within the debounce window right before
  // navigating away must not be lost from the stored draft.
  useEffect(() => {
    return () => {
      if (pendingDraftRef.current) saveCatalogDraft(pendingDraftRef.current);
    };
  }, []);

  const rows: EditorRowData[] = useMemo(() => {
    if (!draft || draft === "missing") return [];
    return draft.rows.map((row) => ({
      id: row.localId,
      name: row.name,
      unit: row.unit,
      priceInput: row.priceInput,
      resourceType: row.resourceType,
      typeAutoFilled: row.typeAutoFilled,
      supplierSku: row.supplierSku,
      matchedArticleId: row.matchedArticleId,
      matchedArticleName: row.matchedArticleName,
      sourceRowNumber: row.sourceRowNumber,
      issues: row.issues,
      severity: row.severity,
    }));
  }, [draft]);

  if (!draft) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("app.loading")}
      </div>
    );
  }

  if (draft === "missing") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center space-y-3">
        <FileWarning className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-h3 text-foreground">{t("catalogReview.missing.title")}</h1>
        <p className="text-body-sm text-muted-foreground">{t("catalogReview.missing.body")}</p>
        <Button asChild variant="outline">
          <Link to={CATALOGS_TAB_URL}>{t("catalogReview.missing.cta")}</Link>
        </Button>
      </div>
    );
  }

  const counts = countBySeverity(draft.rows);
  const isSupabaseMode = workspaceMode.kind === "supabase";
  // Mirrors the create_user_catalog RPC's item cap (reachable via "+ Добавить
  // строку" on a truncated 1000-row upload).
  const tooManyRows = draft.rows.length > 1000;
  const canSave =
    isSupabaseMode &&
    !saveMutation.isPending &&
    draft.rows.length > 0 &&
    !tooManyRows &&
    counts.blocking === 0 &&
    draft.catalogName.trim().length > 0;

  const handleRowChange = (id: string, patch: EditorRowPatch) => {
    if (!editedRowIds.current.has(id)) {
      editedRowIds.current.add(id);
      trackEvent("catalog_row_edited", { upload_id: draft.uploadId });
    }
    setDraft((current) =>
      current && current !== "missing"
        ? { ...current, rows: editDraftRow(current.rows, id, patch) }
        : current,
    );
  };

  const handleRowDelete = (id: string) => {
    setDraft((current) =>
      current && current !== "missing"
        ? { ...current, rows: removeDraftRow(current.rows, id) }
        : current,
    );
  };

  const handleAddRow = () => {
    setDraft((current) =>
      current && current !== "missing"
        ? { ...current, rows: appendEmptyDraftRow(current.rows) }
        : current,
    );
  };

  const handleSave = async () => {
    if (!canSave) return;
    const items = draft.rows.map((row, index) => ({
      name: row.name.trim(),
      unit: row.unit.trim(),
      priceCents: parsePriceInputToCents(row.priceInput) ?? 0,
      resourceType: row.resourceType,
      supplierSku: row.supplierSku.trim() || null,
      matchedArticleId: row.matchedArticleId,
      position: index,
    }));
    try {
      const catalogId = await saveMutation.mutateAsync({
        name: draft.catalogName.trim(),
        sourceFilename: draft.fileName,
        items,
      });
      trackEvent("catalog_saved", {
        rows: items.length,
        matched_rows: items.filter((item) => item.matchedArticleId).length,
      });
      removeCatalogDraft(draft.uploadId);
      // Disarm the debounced persist AND the unmount flush — otherwise an
      // edit made within 400ms of a successful save resurrects the just-
      // removed draft on navigation.
      pendingDraftRef.current = null;
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      toast({ title: t("catalogReview.savedToast", { name: draft.catalogName.trim() }) });
      navigate(`/home/catalogs/${catalogId}`, { replace: true });
    } catch (error) {
      toast({
        title: t("catalogReview.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            to={CATALOGS_TAB_URL}
            className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("catalogReview.backToCatalogs")}
          </Link>
          <h1 className="text-h3 text-foreground">{t("catalogReview.title")}</h1>
          <p className="truncate text-caption text-muted-foreground">{draft.fileName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {t("catalogReview.stats.rows", { count: draft.rows.length })}
          </Badge>
          {counts.blocking > 0 && (
            <Badge className="bg-destructive/15 text-destructive tabular-nums hover:bg-destructive/15">
              {t("catalogReview.stats.blocking", { count: counts.blocking })}
            </Badge>
          )}
          {counts.warning > 0 && (
            <Badge className="bg-warning/15 text-warning tabular-nums hover:bg-warning/15">
              {t("catalogReview.stats.warnings", { count: counts.warning })}
            </Badge>
          )}
        </div>
      </div>

      {draft.truncated && (
        <div className="rounded-panel border border-warning/50 bg-warning/10 p-3 text-body-sm text-foreground">
          {t("catalogReview.truncated", {
            total: draft.totalDataRows,
            kept: draft.rows.length,
          })}
        </div>
      )}

      {!isSupabaseMode && (
        <div className="rounded-panel border border-border bg-muted/40 p-3 text-body-sm text-muted-foreground">
          {t("catalogReview.signInToSave")}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-md space-y-1">
          <Label htmlFor="catalog-name" className="text-body-sm font-medium">
            {t("catalogReview.nameLabel")}
          </Label>
          <Input
            id="catalog-name"
            maxLength={200}
            value={draft.catalogName}
            onChange={(event) =>
              setDraft((current) =>
                current && current !== "missing"
                  ? { ...current, catalogName: event.target.value }
                  : current,
              )
            }
            placeholder={t("catalogReview.namePlaceholder")}
          />
        </div>
        <Button onClick={handleSave} disabled={!canSave} className="gap-2">
          {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("catalogReview.save")}
        </Button>
      </div>

      {counts.blocking > 0 && (
        <p className="text-caption text-destructive">{t("catalogReview.blockingHint")}</p>
      )}

      {tooManyRows && (
        <p className="text-caption text-destructive">
          {t("catalogReview.tooManyRows", { max: 1000 })}
        </p>
      )}

      <CatalogItemsEditor
        rows={rows}
        onRowChange={handleRowChange}
        onRowDelete={handleRowDelete}
        onAddRow={handleAddRow}
        matchSearchEnabled={isSupabaseMode}
        disabled={saveMutation.isPending}
      />
    </div>
  );
}
