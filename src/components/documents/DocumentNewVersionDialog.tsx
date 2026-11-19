import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DOCUMENT_UPLOAD_ACCEPT } from "@/lib/document-file-types";

export interface DocumentNewVersionDialogProps {
  open: boolean;
  documentTitle: string;
  /** Owner or co-owner with a live public link: the link keeps the old file. */
  showShareHint: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves true when the version is saved; the dialog then closes. */
  onUpload: (file: File) => Promise<boolean>;
}

export function DocumentNewVersionDialog({
  open,
  documentTitle,
  showShareHint,
  onOpenChange,
  onUpload,
}: DocumentNewVersionDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setUploading(false);
    }
  }, [open]);

  async function handleSubmit() {
    if (!file || uploading) return;
    setUploading(true);
    let saved = false;
    try {
      saved = await onUpload(file);
    } finally {
      setUploading(false);
    }
    if (saved) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && uploading) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-card border border-border rounded-modal max-w-md shadow-xl gap-4">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">{t("documents.newVersion.title")}</DialogTitle>
          <DialogDescription className="[overflow-wrap:anywhere]">
            {t("documents.newVersion.description", { title: documentTitle })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-body-sm font-medium text-foreground" htmlFor="document-new-version-file">
            {t("documents.upload.fileLabel")}
          </label>
          <FileInput
            id="document-new-version-file"
            accept={DOCUMENT_UPLOAD_ACCEPT}
            disabled={uploading}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        {showShareHint && (
          <div className="rounded-panel border border-info/50 bg-info/10 p-3 text-caption text-foreground">
            {t("documents.newVersion.shareHint")}
          </div>
        )}
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => { void handleSubmit(); }}
            disabled={!file || uploading}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t("documents.upload.uploading")}
              </>
            ) : (
              t("documents.newVersion.submit")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
