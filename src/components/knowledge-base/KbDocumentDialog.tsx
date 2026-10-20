// Document window for the knowledge base. Same shell as FilePreviewDialog
// (header, scrollable body, footer with buttons): there is no file to preview,
// so the body is the registry facts, and the footer carries one button per
// source link (official first) before «Закрыть».

import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { KbDocument } from "@/lib/knowledge-base/api";
import { useKbDocumentView } from "./kb-view";

interface KbDocumentDialogProps {
  doc: KbDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KbDocumentDialog({ doc, open, onOpenChange }: KbDocumentDialogProps) {
  const { t } = useTranslation();
  const view = useKbDocumentView(doc);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="pr-6">{view?.heading ?? ""}</DialogTitle>
          <DialogDescription>{doc?.category ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {view && view.rows.length > 0 && (
            <dl className="rounded-panel border border-border bg-muted/30 p-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
              {view.rows.map((row) => (
                <div key={row.key} className="contents">
                  <dt className="text-caption text-muted-foreground">{row.label}</dt>
                  <dd className="text-body-sm text-foreground break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view?.showFullTextLater && (
            <p className="text-body-sm text-muted-foreground">{t("home.knowledgeBase.fullTextLater")}</p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4 gap-2 sm:gap-2 flex-col sm:flex-row">
          {view?.buttons.map((button, index) => (
            <Button key={button.href} asChild variant={index === 0 ? "default" : "outline"}>
              <a href={button.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {button.label}
              </a>
            </Button>
          ))}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
