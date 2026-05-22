import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/ui/file-input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { useScopedDocumentUpload } from "@/components/upload/use-scoped-document-upload";
import {
  ESTIMATE_TEMPLATE_SCOPE_TAGS,
  PENDING_INGEST_TYPE,
  type UploadResult,
  type UploadScope,
} from "@/components/upload/types";

export interface EstimateTemplateFormProps {
  scope: UploadScope;
  projectId?: string;
  onBack: () => void;
  onClose: () => void;
  onComplete?: (result: UploadResult) => void;
}

export function EstimateTemplateForm({
  scope,
  projectId,
  onBack,
  onClose,
  onComplete,
}: EstimateTemplateFormProps) {
  const { t } = useTranslation();
  const upload = useScopedDocumentUpload(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [scopeTag, setScopeTag] = useState<string>("general");
  const [moderationConsent, setModerationConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPublic = scope === "public";
  const canSubmit = Boolean(title.trim()) && Boolean(file) && (!isPublic || moderationConsent);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim()) {
      toast({ title: t("upload.modal.errors.fileRequired"), variant: "destructive" });
      return;
    }
    const scopeNote = t("upload.modal.step3.estimate_template.scopeTagNote", { scope: scopeTag });
    const ingestNote = t("upload.modal.step3.estimate_template.ingestNote");
    const finalDescription = [description.trim(), scopeNote, ingestNote].filter(Boolean).join("\n\n");
    setSubmitting(true);
    try {
      const result = await upload({
        scope,
        file,
        title: title.trim(),
        type: PENDING_INGEST_TYPE.estimate_template,
        description: finalDescription,
      });
      toast({ title: t("upload.modal.successMessages.estimate_template") });
      onComplete?.({ type: "estimate_template", scope, documentId: result.documentId ?? undefined });
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
          <Label className="text-body-sm font-medium">
            {t("upload.modal.step3.estimate_template.name")}
          </Label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("upload.modal.step3.estimate_template.namePlaceholder")}
            disabled={submitting}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-body-sm font-medium">
            {t("upload.modal.step3.estimate_template.file")}
          </Label>
          <FileInput
            accept=".xlsx"
            disabled={submitting}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              if (selected && !title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
            }}
          />
          <p className="text-caption text-muted-foreground">
            {t("upload.modal.step3.estimate_template.fileHint")}
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-body-sm font-medium">
            {t("upload.modal.step3.estimate_template.scopeTag")}
          </Label>
          <Select value={scopeTag} onValueChange={setScopeTag} disabled={submitting}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTIMATE_TEMPLATE_SCOPE_TAGS.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {t(`upload.modal.step3.estimate_template.scopeTags.${tag}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-body-sm font-medium">
            {t("upload.modal.step3.estimate_template.description")}{" "}
            <span className="text-caption text-muted-foreground font-normal">
              ({t("common.optional")})
            </span>
          </Label>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("upload.modal.step3.estimate_template.descriptionPlaceholder")}
            rows={3}
            disabled={submitting}
          />
        </div>

        {isPublic && (
          <label className="flex items-start gap-2 rounded-panel border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
            <Checkbox
              checked={moderationConsent}
              onCheckedChange={(checked) => setModerationConsent(checked === true)}
              disabled={submitting}
              className="mt-0.5"
            />
            <span className="text-caption text-foreground">
              {t("upload.modal.step3.estimate_template.moderationConsent")}
            </span>
          </label>
        )}

        <div className="rounded-panel border border-dashed border-border p-3 space-y-2">
          <p className="text-caption text-muted-foreground">
            {t("upload.modal.step3.estimate_template.createFromScratchIntro")}
          </p>
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-block">
                <Button type="button" variant="outline" size="sm" disabled>
                  {t("upload.modal.step3.estimate_template.createFromScratch")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t("upload.modal.step3.estimate_template.createFromScratchDisabledTooltip")}
            </TooltipContent>
          </Tooltip>
        </div>
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
