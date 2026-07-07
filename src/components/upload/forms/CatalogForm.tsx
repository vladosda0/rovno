import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { ParsePriceListError, useParsePriceList } from "@/hooks/use-parse-price-list";
import { buildDraftFromParse, saveCatalogDraft } from "@/lib/user-catalog/draft-storage";
import { countBySeverity } from "@/lib/user-catalog/validation";
import { trackEvent } from "@/lib/analytics";

export interface CatalogFormProps {
  onBack: () => void;
  onClose: () => void;
}

const TEMPLATE_HREF = "/templates/rovno-price-list-template.xlsx";
const TEMPLATE_DOWNLOAD_NAME = "Шаблон прайс-листа Rovno.xlsx";

const KNOWN_ERROR_CODES = new Set([
  "EMPTY_FILE",
  "BAD_HEADERS",
  "TOO_LARGE",
  "UNSUPPORTED_FORMAT",
  "PARSE_FAILED",
]);

/**
 * User Catalog Upload v1 — the "Каталог" branch of the upload modal.
 *
 * Replaces the old pending-ingest save (workspace_documents rows with
 * type=catalog_pending_ingest): the file is parsed synchronously by the
 * parse-price-list edge function and the user lands in the review editor at
 * /home/catalogs/upload-review/<uploadId>. Parsing starts right on file pick —
 * no extra submit click (spec: zero-friction upload).
 */
export function CatalogForm({ onBack, onClose }: CatalogFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  const parseMutation = useParsePriceList();
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const isSupabaseMode = workspaceMode.kind === "supabase";
  const parsing = parseMutation.isPending;

  const memoItems = [
    t("catalogUpload.memo.copy"),
    t("catalogUpload.memo.type"),
    t("catalogUpload.memo.units"),
    t("catalogUpload.memo.examples"),
  ];

  async function handleFileSelected(file: File | null) {
    if (!file || parsing) return;
    setErrorCode(null);
    try {
      const parsed = await parseMutation.mutateAsync(file);
      const uploadId = crypto.randomUUID();
      const draft = buildDraftFromParse(uploadId, parsed);
      saveCatalogDraft(draft);
      const counts = countBySeverity(draft.rows);
      trackEvent("catalog_uploaded", {
        rows: parsed.totalDataRows,
        truncated: parsed.truncated,
        blocking_rows: counts.blocking,
        warning_rows: counts.warning,
      });
      onClose();
      navigate(`/home/catalogs/upload-review/${uploadId}`);
    } catch (error) {
      setErrorCode(
        error instanceof ParsePriceListError && KNOWN_ERROR_CODES.has(error.code)
          ? error.code
          : "PARSE_FAILED",
      );
    }
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        <ul className="space-y-1.5 rounded-panel border border-border bg-muted/30 p-3">
          {memoItems.map((item) => (
            <li key={item} className="flex gap-2 text-caption text-foreground">
              <span className="text-muted-foreground">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2"
            asChild
          >
            <a
              href={TEMPLATE_HREF}
              download={TEMPLATE_DOWNLOAD_NAME}
              onClick={() => trackEvent("catalog_template_downloaded")}
            >
              <Download className="h-4 w-4" />
              {t("catalogUpload.downloadTemplate")}
            </a>
          </Button>
          <p className="text-caption text-muted-foreground text-center">
            {t("catalogUpload.templateHint")}
          </p>
        </div>

        {isSupabaseMode ? (
          <div className="space-y-1">
            <FileInput
              accept=".xlsx,.xls,.csv"
              disabled={parsing}
              onChange={(event) => {
                void handleFileSelected(event.target.files?.[0] ?? null);
              }}
            />
            <p className="text-caption text-muted-foreground">
              {t("catalogUpload.fileHint")}
            </p>
          </div>
        ) : (
          <div className="rounded-panel border border-border bg-muted/40 p-3 text-body-sm text-muted-foreground">
            {t("catalogUpload.signInRequired")}
          </div>
        )}

        {parsing && (
          <div className="flex items-center gap-2 text-body-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("catalogUpload.parsing")}
          </div>
        )}

        {errorCode && !parsing && (
          <div className="flex items-start gap-2 rounded-panel border border-warning/50 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 text-body-sm text-foreground">
              <p>{t(`catalogUpload.errors.${errorCode}`)}</p>
              {errorCode === "BAD_HEADERS" && (
                <p className="mt-1 text-caption text-muted-foreground">
                  {t("catalogUpload.errors.BAD_HEADERS_hint")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-between shrink-0">
        <Button type="button" variant="outline" onClick={onBack} disabled={parsing}>
          {t("upload.modal.back")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} disabled={parsing}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
