// The knowledge-base label: green «Проверено <date>», yellow «Проверяется» on
// the same spot, red «Не действует» (label v2, 21.10). Since slice 7 (mockup v6,
// 03.11) pressing the label (and hovering it on a computer) opens one window over
// the text: «Сведения» on top, «История» below by date, future entries first and
// blue. The window is the same for every status and for a solution card; only
// the info rows and the history entries differ. A green label carries a clock
// while an approved amendment waits for its date. A tile shows the label alone.

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { KbDocument } from "@/lib/knowledge-base/api";
import type { KbLabelKind } from "@/lib/knowledge-base/kbFullText.mjs";
import { amendmentList } from "@/lib/knowledge-base/kbFullText.mjs";
import { kbHasUpcoming, kbHistoryEntries } from "@/lib/knowledge-base/kbHistory.mjs";
import { kbDocPath } from "@/lib/knowledge-base/kbConfig.mjs";
import { useKbHistory, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { useKbDocumentView } from "./kb-view";

// Green and red from the design system; the yellow is the approved mockup shade
// (hsl 42 95% 55% on hsl 32 80% 18%): the system's --warning is orange.
const LABEL_STYLES: Record<KbLabelKind, string> = {
  verified: "bg-success/15 text-success",
  checking: "bg-[hsl(42_95%_55%)] text-[hsl(32_80%_18%)]",
  inactive: "bg-destructive/15 text-destructive",
};

const BASE = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap";

export function KbLabelBadge({
  kind,
  text,
  clock = false,
  className,
}: {
  kind: KbLabelKind;
  text: string;
  clock?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(BASE, LABEL_STYLES[kind], className)} data-kb-label={kind}>
      {clock && <Clock className="h-3 w-3" aria-hidden="true" data-kb-clock />}
      {text}
    </span>
  );
}

export interface KbInfoRow {
  key: string;
  label: string;
  value: string;
}

interface KbLabelWindowProps {
  kind: KbLabelKind;
  text: string;
  clock?: boolean;
  rows: KbInfoRow[];
  history: { kind: "doc" | "solution"; slug: string };
  appliedList?: string | null;
  /** A document's amendments marked «not in the text yet» (shown even without a journal row). */
  pending?: Array<{ no: number; url: string | null }>;
}

const canHover = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;

/** The label as a button that opens the «Сведения / История» window. */
export function KbLabelWindow({ kind, text, clock = false, rows, history, appliedList = null, pending = [] }: KbLabelWindowProps) {
  const { t } = useTranslation();
  const tr = (key: string, vars?: Record<string, unknown>) => t(key, vars) as string;
  const [open, setOpen] = useState(false);
  const openedByHover = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyQuery = useKbHistory(history.kind, history.slug, open);
  const entries = kbHistoryEntries(historyQuery.data ?? [], tr, { appliedList, docPath: kbDocPath, pending });

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const hoverOpen = () => {
    if (!canHover()) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!open) openedByHover.current = true;
    setOpen(true);
  };
  const hoverClose = () => {
    if (!canHover()) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      openedByHover.current = false;
      setOpen(false);
    }, 150);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) openedByHover.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(BASE, LABEL_STYLES[kind], "cursor-pointer")}
          data-kb-label={kind}
          onMouseEnter={hoverOpen}
          onMouseLeave={hoverClose}
          onClick={(e) => {
            // Hover already opened it: the press keeps it open instead of toggling it shut.
            if (openedByHover.current && open) {
              e.preventDefault();
              openedByHover.current = false;
            }
          }}
        >
          {clock && <Clock className="h-3 w-3" aria-hidden="true" data-kb-clock />}
          {text}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 max-w-[calc(100vw-2rem)] space-y-3 text-body-sm text-foreground"
        onMouseEnter={hoverOpen}
        onMouseLeave={hoverClose}
        onOpenAutoFocus={(e) => {
          if (openedByHover.current) e.preventDefault();
        }}
        data-kb-window
      >
        <section className="space-y-1.5">
          <p className="font-semibold">{t("home.knowledgeBase.window.info")}</p>
          {rows.length > 0 ? (
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
              {rows.map((row) => (
                <div key={row.key} className="contents">
                  <dt>{row.label}</dt>
                  <dd className="break-words">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
        <section className="space-y-1.5 border-t border-border pt-3">
          <p className="font-semibold">{t("home.knowledgeBase.window.history")}</p>
          {historyQuery.isLoading ? (
            <p>{t("home.knowledgeBase.window.loading")}</p>
          ) : historyQuery.isError ? (
            <p>{t("home.knowledgeBase.window.error")}</p>
          ) : entries.length === 0 ? (
            <p>{t("home.knowledgeBase.window.empty")}</p>
          ) : (
            <ul className="space-y-1">
              {entries.map((entry) => (
                <li key={entry.key} className={cn("grid grid-cols-[5.5rem_1fr] gap-x-3", entry.future && "text-accent")} data-kb-history={entry.future ? "future" : "past"}>
                  <span>{entry.date}</span>
                  <span>
                    {entry.text}
                    {entry.link && (
                      <>
                        {" "}
                        {entry.link.href ? (
                          <a
                            href={entry.link.href}
                            className="text-accent hover:underline"
                            {...(entry.link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                          >
                            {entry.link.label}
                          </a>
                        ) : (
                          entry.link.label
                        )}
                      </>
                    )}
                    {entry.suffix}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PopoverContent>
    </Popover>
  );
}

interface KbTextLabelProps {
  doc: KbDocument;
  kind: KbLabelKind;
  text: string;
}

/** A document's label with its window: info rows from the document window, its history. */
export function KbTextLabel({ doc, kind, text }: KbTextLabelProps) {
  const sp = useKbSpFullText();
  const view = useKbDocumentView(doc, { spFullText: sp.data });
  const rows = (view?.rows ?? []).filter((row) => !row.badge).map(({ key, label, value }) => ({ key, label, value }));
  return (
    <KbLabelWindow
      kind={kind}
      text={text}
      clock={kind === "verified" && kbHasUpcoming(doc)}
      rows={rows}
      history={{ kind: "doc", slug: doc.slug }}
      appliedList={doc.appliedAmendments.length ? amendmentList(doc.appliedAmendments) : null}
      pending={kind === "checking" ? doc.pendingAmendments : []}
    />
  );
}
