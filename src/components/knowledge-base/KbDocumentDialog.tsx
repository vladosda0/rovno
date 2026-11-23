// Document window for the knowledge base. Same shell as FilePreviewDialog
// (header, scrollable body, footer with buttons): there is no file to preview,
// so the body is the registry facts, and the footer carries one button per
// source link (official first), then «Следить за изменениями» (slice 8, frame
// 4a), then «Закрыть».

import { useTranslation } from "react-i18next";
import { BookOpen, ExternalLink, Info } from "lucide-react";
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
import { useKbArticleTarget, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { kbArticleReason } from "@/lib/knowledge-base/kbArticleRecord.mjs";
import { useKbDocumentView } from "./kb-view";
import { KbTextLabel } from "./KbTextLabel";
import { KbCopyNotice } from "./KbCopyNotice";
import { KbWatchButton } from "./KbWatchButton";

interface KbDocumentDialogProps {
  doc: KbDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opens the reading page (slice 2) of this document, or of the code a record
   * about one of its articles points into (9.9, with the article's anchor).
   * Without it the window has no «Читать полный текст».
   */
  onRead?: (target: { slug: string; anchor?: string }) => void;
}

export function KbDocumentDialog({ doc, open, onOpenChange, onRead }: KbDocumentDialogProps) {
  const { t } = useTranslation();
  const sp = useKbSpFullText();
  const ownView = useKbDocumentView(doc, { spFullText: sp.data });
  // 9.9: a record about an article of a code opens the code there, or says why not.
  const articleQuery = useKbArticleTarget(doc, !!doc && !!ownView && !ownView.readable);
  const article = articleQuery.data ?? null;
  const reason = kbArticleReason(article, t);
  const shown = doc && reason ? { ...doc, textUnavailableReason: reason } : doc;
  const view = useKbDocumentView(shown, { spFullText: sp.data });
  const canRead = !!doc && !!view?.readable && !!onRead;
  const articleOpen = article?.kind === "open" && !!onRead ? article : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="pr-6">{view?.heading ?? ""}</DialogTitle>
          <DialogDescription>{doc?.category ?? ""}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {view?.copyNotice && <KbCopyNotice text={view.copyNotice} />}
          {view && view.rows.length > 0 && (
            <dl className="rounded-panel border border-border bg-muted/30 p-4 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
              {view.rows.map((row) => (
                <div key={row.key} className="contents">
                  <dt className="text-caption text-muted-foreground">{row.label}</dt>
                  <dd className="text-body-sm text-foreground break-words">
                    {row.badge && doc ? <KbTextLabel doc={doc} kind={row.badge} text={row.value} /> : row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {view?.fullTextNote && !articleOpen && !articleQuery.isLoading && (
            <p className="flex items-start gap-2 text-body-sm text-muted-foreground">
              {shown?.textUnavailableReason && <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
              <span>{view.fullTextNote}</span>
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4 gap-2 sm:gap-2 flex-col sm:flex-row">
          {canRead && (
            <Button onClick={() => onRead!({ slug: doc!.slug })}>
              <BookOpen className="h-4 w-4 mr-1.5" />
              {t("home.knowledgeBase.reader.read")}
            </Button>
          )}
          {articleOpen && (
            <Button onClick={() => onRead!({ slug: articleOpen.slug, anchor: articleOpen.anchor })}>
              <BookOpen className="h-4 w-4 mr-1.5" />
              {t("home.knowledgeBase.article.readInCode", { code: articleOpen.ref.codeLabel })}
            </Button>
          )}
          {view?.buttons.map((button, index) => (
            <Button key={button.href} asChild variant={index === 0 && !canRead && !articleOpen ? "default" : "outline"}>
              <a href={button.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {button.label}
              </a>
            </Button>
          ))}
          {doc && <KbWatchButton slug={doc.slug} size="default" />}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
