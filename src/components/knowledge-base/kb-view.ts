// View model for one knowledge-base document: the rows and source buttons shown
// in the in-app document window and on the public /baza/<slug>/ page. The rules
// live in kbConfig.mjs so the prerenderer renders the same thing.

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { KbDocument } from "@/lib/knowledge-base/api";
import {
  buildKbDocumentView as buildView,
  type KbDocumentView,
  type KbSourceButton,
} from "@/lib/knowledge-base/kbConfig.mjs";

export type { KbDocumentView, KbSourceButton };

export function buildKbDocumentView(doc: KbDocument, t: TFunction): KbDocumentView {
  return buildView(doc, (key, vars) => t(key, vars) as string);
}

export function kbSourceButtons(doc: KbDocument, t: TFunction): KbSourceButton[] {
  return buildKbDocumentView(doc, t).buttons;
}

export function useKbDocumentView(doc: KbDocument | null): KbDocumentView | null {
  const { t } = useTranslation();
  return doc ? buildKbDocumentView(doc, t) : null;
}

/** Opens a vetted source link in a new tab without handing it our window. */
export function openKbSource(href: string) {
  window.open(href, "_blank", "noopener,noreferrer");
}
