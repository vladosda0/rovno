import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { useScopedDocumentUpload } from "@/components/upload/use-scoped-document-upload";
import { PENDING_INGEST_TYPE, type UploadResult, type UploadScope } from "@/components/upload/types";

export interface CatalogFormProps {
  scope: UploadScope;
  projectId?: string;
  onBack: () => void;
  onClose: () => void;
  onComplete?: (result: UploadResult) => void;
}

export function CatalogForm({ scope, projectId, onBack, onClose, onComplete }: CatalogFormProps) {
  const { t } = useTranslation();
  const upload = useScopedDocumentUpload(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [markupConsent, setMarkupConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPublic = scope === "public";
  const canSubmit = Boolean(title.trim()) && Boolean(file) && (!isPublic || markupConsent);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) {
      toast({ title: t("upload.modal.errors.fileRequired"), variant: "destructive" });
      return;
    }
    const note = t("upload.modal.step3.catalog.ingestNote");
    const finalDescription = [description.trim(), note].filter(Boolean).join("\n\n");
    setSubmitting(true);
    try {
      const result = await upload({
        scope,
        file,
        title: title.trim(),
        type: PENDING_INGEST_TYPE.catalog,
        description: finalDescription,
      });
      toast({ title: t("upload.modal.successMessages.catalog") });
      onComplete?.({ type: "catalog", scope, documentId: result.documentId ?? undefined });
      onClose();
    } catch (error) {
      toast({
        title: t("upload.modal.errors.saveFailed"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
        <div className="space-y-1">
          <Label className="text-body-sm font-medium">{t("upload.modal.step3.catalog.name")}</Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("upload.modal.step3.catalog.namePlaceholder")}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-body-sm font-medium">{t("upload.modal.step3.catalog.file")}</Label>
          <FileInput
            accept=".xlsx,.xls,.csv"
            disabled={submitting}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (selected && !title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
            }}
          />
          <p className="text-caption text-muted-foreground">
            {t("upload.modal.step3.catalog.fileHint")}
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-body-sm font-medium">
            {t("upload.modal.step3.catalog.description")}{" "}
            <span className="text-caption text-muted-foreground font-normal">
              ({t("common.optional")})
            </span>
          </Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("upload.modal.step3.catalog.descriptionPlaceholder")}
            rows={3}
            disabled={submitting}
          />
        </div>

        {isPublic && (
          <label className="flex items-start gap-2 rounded-panel border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <Checkbox
              checked={markupConsent}
              onCheckedChange={(checked) => setMarkupConsent(checked === true)}
              disabled={submitting}
              className="mt-0.5"
            />
            <span className="text-caption text-foreground">
              {t("upload.modal.step3.catalog.markupConsent")}
            </span>
          </label>
        )}
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-between shrink-0">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          {t("upload.modal.back")}
        </Button>
        <Button
          type="submit"
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={submitting || !canSubmit}
        >
          {submitting ? t("upload.modal.saving") : t("upload.modal.save")}
        </Button>
      </div>
    </form>
  );
}
