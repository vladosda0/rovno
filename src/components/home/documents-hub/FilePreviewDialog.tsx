import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface PreviewableDocument {
  id: string;
  title: string;
  type?: string;
  origin?: string;
  description?: string | null;
  tags?: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  scope?: "personal" | "org";
  bucket?: string;
  objectPath?: string;
  mimeType?: string;
}

interface FilePreviewDialogProps {
  doc: PreviewableDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreviewDialog({ doc, open, onOpenChange }: FilePreviewDialogProps) {
  const { t } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  useEffect(() => {
    if (!open || !doc || !doc.bucket || !doc.objectPath) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    setUrlLoading(true);
    setSignedUrl(null);
    supabase.storage
      .from(doc.bucket)
      .createSignedUrl(doc.objectPath, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
        }
        setUrlLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSignedUrl(null);
        setUrlLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, doc]);

  const isImage = doc?.mimeType?.startsWith("image/");
  const isPdf = doc?.mimeType === "application/pdf";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="truncate">{doc?.title ?? t("home.documentsHub.preview.title")}</DialogTitle>
          {doc?.description && (
            <DialogDescription className="line-clamp-2">{doc.description}</DialogDescription>
          )}
          {!doc?.description && (
            <DialogDescription className="sr-only">
              {t("home.documentsHub.preview.descriptionFallback")}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {urlLoading && (
            <Skeleton className="h-48 w-full" />
          )}
          {!urlLoading && signedUrl && isImage && (
            <img src={signedUrl} alt="" className="mx-auto max-h-[60vh] rounded-md object-contain" />
          )}
          {!urlLoading && signedUrl && isPdf && (
            <iframe
              src={signedUrl}
              title={doc?.title ?? "preview"}
              className="h-[60vh] w-full rounded-md border border-border"
            />
          )}
          {!urlLoading && !signedUrl && doc?.bucket && (
            <p className="text-body-sm text-muted-foreground">
              {t("home.documentsHub.preview.unavailable")}
            </p>
          )}
          {!doc?.bucket && doc?.description && (
            <div className="rounded-panel border border-border bg-muted/30 p-4">
              <p className="whitespace-pre-wrap text-body-sm text-foreground">{doc.description}</p>
            </div>
          )}

          {doc?.createdAt && (
            <p className="text-caption text-muted-foreground">
              {t("home.documentsHub.preview.fieldCreated")}: {doc.createdAt.slice(0, 10)}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4 gap-2 sm:gap-2">
          {signedUrl && (
            <>
              <Button asChild variant="outline">
                <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  {t("home.documentsHub.preview.openInNewTab")}
                </a>
              </Button>
              <Button asChild>
                <a href={signedUrl} download>
                  <Download className="h-4 w-4 mr-1.5" />
                  {t("home.documentsHub.preview.download")}
                </a>
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Helper to fetch a signed URL imperatively (for download/view buttons on tiles). */
export async function openStorageUrlInNewTab(bucket: string, objectPath: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  return true;
}

export async function downloadStorageUrl(bucket: string, objectPath: string, filename: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600, {
    download: filename,
  });
  if (error || !data?.signedUrl) return false;
  const link = document.createElement("a");
  link.href = data.signedUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return true;
}
