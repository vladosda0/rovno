import { useCallback, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShurikSelectionAsk } from "@/components/ai/ShurikSelectionAsk";
import { Button } from "@/components/ui/button";
import { useWorkspaceMode } from "@/hooks/use-mock-data";
import { askShurik } from "@/lib/shurik-ask";

/** The chat outside a project lives on the server, so these stay away in demo and local modes. */
export function useKbAskShurikAvailable(): boolean {
  return useWorkspaceMode().kind === "supabase";
}

/** «Спросить Шурика» in the header of an in-app page of the base (docs-library 6.7, frame 5). */
export function KbAskShurikButton({ label }: { label: string }) {
  const { t } = useTranslation();
  const available = useKbAskShurikAvailable();
  if (!available) return null;
  return (
    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => askShurik({ label })}>
      {t("home.knowledgeBase.askShurik")}
    </Button>
  );
}

interface KbSelectionAskProps {
  /** The document or the card, when the selection names nothing narrower. */
  label: string;
  within: string;
  labelFor?: (element: Element) => string | undefined;
  children: ReactNode;
}

/** The window over text selected on a page of the base; the quote goes to the chat with its clause. */
export function KbSelectionAsk({ label, within, labelFor, children }: KbSelectionAskProps) {
  const available = useKbAskShurikAvailable();
  const containerRef = useRef<HTMLDivElement>(null);
  const onSubmit = useCallback((quote: string, quoteLabel: string | undefined, question: string) => {
    askShurik({ label: quoteLabel ?? label, quote, question });
  }, [label]);
  return (
    <>
      <div ref={containerRef}>{children}</div>
      {available && <ShurikSelectionAsk containerRef={containerRef} within={within} labelFor={labelFor} onSubmit={onSubmit} />}
    </>
  );
}
