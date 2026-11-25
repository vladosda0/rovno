import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MOBILE_MAX_WIDTH_PX = 767;
const POPOVER_WIDTH_PX = 320;
const POPOVER_HEIGHT_PX = 150;
const EDGE_GAP_PX = 8;
const MAX_QUOTE_CHARS = 1000;

interface OpenAsk {
  quote: string;
  label?: string;
  top: number;
  left: number;
}

interface ShurikSelectionAskProps {
  containerRef: RefObject<HTMLElement>;
  /** The selection counts only when both of its ends lie inside an element matching this. */
  within: string;
  /** What the quote is from, for the element the selection starts in. */
  labelFor?: (element: Element) => string | undefined;
  /** False: it could not go now, the window stays open with its text. */
  onSubmit: (quote: string, label: string | undefined, question: string) => boolean | void;
}

function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

/**
 * The small window over selected text (docs-library 6.7, frames 2a and 5), one for a page of the
 * base and for Shurik's answers. Not on a phone: there a selection argues with the system menu.
 * The width is read at the moment of selecting, as `useIsMobile` only knows it after a paint.
 */
export function ShurikSelectionAsk({ containerRef, within, labelFor, onSubmit }: ShurikSelectionAskProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<OpenAsk | null>(null);
  const [question, setQuestion] = useState("");
  const popoverRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const read = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
      const start = elementOf(selection.anchorNode);
      const end = elementOf(selection.focusNode);
      const container = containerRef.current;
      if (!start || !end || !container?.contains(start) || !container.contains(end)) return;
      if (!start.closest(within) || !end.closest(within)) return;
      const quote = selection.toString().trim().slice(0, MAX_QUOTE_CHARS);
      if (!quote) return;
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setQuestion("");
      setOpen({
        quote,
        label: labelFor?.(start),
        top: Math.min(rect.bottom + EDGE_GAP_PX, window.innerHeight - POPOVER_HEIGHT_PX),
        left: Math.max(EDGE_GAP_PX, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH_PX - EDGE_GAP_PX)),
      });
    };

    const onMouseUp = (event: MouseEvent) => {
      if (window.innerWidth <= MOBILE_MAX_WIDTH_PX) return;
      if (popoverRef.current?.contains(event.target as Node)) return;
      // The browser settles the selection after this event.
      timer = setTimeout(read, 0);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [containerRef, within, labelFor]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onSubmit(open.quote, open.label, question.trim()) !== false) setOpen(null);
  };

  return createPortal(
    <form
      ref={popoverRef}
      onSubmit={submit}
      data-testid="shurik-selection-ask"
      className="fixed z-50 flex w-80 flex-col gap-2 rounded-card border border-border bg-popover p-3 shadow-lg"
      style={{ top: open.top, left: open.left }}
    >
      <p className="text-caption font-semibold text-foreground">{t("ai.selection.title")}</p>
      <Input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={t("ai.sidebar.composer.placeholderDefault")}
        aria-label={t("ai.sidebar.composer.placeholderDefault")}
      />
      <Button type="submit" size="sm" className="self-end bg-accent text-accent-foreground hover:bg-accent/90">
        {t("ai.home.send")}
      </Button>
    </form>,
    document.body,
  );
}
