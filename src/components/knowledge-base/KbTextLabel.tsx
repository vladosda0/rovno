// The full-text label (docs-library, label v2 approved 21.10): green «Проверено
// <date>», yellow «Проверяется» on the same spot, red «Не действует». The yellow
// one opens a small window with the amendments that are not in the text yet and
// links to them on the Minstroy site (frame 2); a tile shows the label without it.

import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { KbDocument } from "@/lib/knowledge-base/api";
import { kbPendingAmendmentsView, type KbLabelKind } from "@/lib/knowledge-base/kbFullText.mjs";

// Green and red from the design system; the yellow is the approved mockup shade
// (hsl 42 95% 55% on hsl 32 80% 18%): the system's --warning is orange.
const LABEL_STYLES: Record<KbLabelKind, string> = {
  verified: "bg-success/15 text-success",
  checking: "bg-[hsl(42_95%_55%)] text-[hsl(32_80%_18%)]",
  inactive: "bg-destructive/15 text-destructive",
};

const BASE = "inline-flex items-center rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap";

export function KbLabelBadge({ kind, text, className }: { kind: KbLabelKind; text: string; className?: string }) {
  return (
    <span className={cn(BASE, LABEL_STYLES[kind], className)} data-kb-label={kind}>
      {text}
    </span>
  );
}

interface KbTextLabelProps {
  doc: KbDocument;
  kind: KbLabelKind;
  text: string;
}

/** The header label; yellow opens the pending-amendments window. */
export function KbTextLabel({ doc, kind, text }: KbTextLabelProps) {
  const { t } = useTranslation();
  if (kind !== "checking" || doc.pendingAmendments.length === 0) {
    return <KbLabelBadge kind={kind} text={text} />;
  }
  const { linked, missing, missingList } = kbPendingAmendmentsView(doc);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(BASE, LABEL_STYLES.checking, "cursor-pointer")} data-kb-label="checking">
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2">
        <p className="text-body-sm font-semibold text-foreground">{t("home.knowledgeBase.pending.title")}</p>
        {linked.length > 0 && (
          <>
            <p className="text-body-sm text-muted-foreground">{t("home.knowledgeBase.pending.body")}</p>
            <ul className="space-y-1">
              {linked.map((a) => (
                <li key={a.no}>
                  <a
                    href={a.url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-body-sm text-accent hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("home.knowledgeBase.pending.item", { no: a.no })}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        {missing.length > 0 && (
          <p className="text-body-sm text-muted-foreground">
            {t(missing.length === 1 ? "home.knowledgeBase.pending.missingOne" : "home.knowledgeBase.pending.missingMany", {
              list: missingList,
            })}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
