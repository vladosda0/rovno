// Type surface for the shared plain-ESM knowledge-base helpers (kbConfig.mjs).

import type { KbFullTextFields, KbLabelKind, KbTextLabel } from "./kbFullText.mjs";

export type KbFolder =
  | "sp"
  | "gost"
  | "laws"
  | "snip"
  | "sanpin"
  | "guides"
  | "manufacturers"
  | "international"
  | "cis"
  | "other";

export type KbLinkKind = "official" | "copy" | "catalog";

export interface KbSourceLink {
  url: string;
  kind: KbLinkKind;
}

export type KbSourceLabelKey =
  | "minstroyCatalog"
  | "minstroy"
  | "consultant"
  | "gostexpert"
  | "manufacturerPdf"
  | "manufacturerSite"
  | "generic";

export declare const KB_FOLDERS: KbFolder[];
export declare const KB_PAGE_SIZE: number;
export declare function displayTitle(doc: { designation?: string | null; title?: string | null }): string;
export declare function formatKbDate(value: unknown): string | null;
export declare function sourceHost(value: unknown): string;
export declare function safeSourceLinks(raw: unknown): KbSourceLink[];
export declare function sourceButtonLabel(
  link: { url?: unknown; kind?: unknown } | null | undefined,
  folder: string,
): { key: KbSourceLabelKey; host: string };
export declare function sanitizeSearchTerm(input: unknown): string;
export declare function searchOrFilter(input: unknown): string | null;
export declare function kbDocPath(slug: string): string;

export interface KbDocumentBaseShape {
  docId: string;
  slug: string;
  designation: string | null;
  title: string;
  category: string;
  folder: KbFolder;
  displayMode: "full_text" | "card";
  objectTypes: string[];
  domains: string[];
  applicabilityNote: string | null;
  publisher: string | null;
  country: string | null;
  edition: string | null;
  effectiveFrom: string | null;
  lastCheckedAt: string | null;
  sourceLinks: KbSourceLink[];
  fullTextAvailable: boolean;
}

export type KbDocumentShape = KbDocumentBaseShape & KbFullTextFields;

export declare function normalizeKbRow(row: unknown): KbDocumentShape;
export declare function kbHeading(doc: { designation?: string | null; title: string }): string;
export declare const KB_SITE_SECTION: string;
export declare function kbPageTitle(doc: { designation?: string | null; title: string }): string;
export declare function kbPageDescription(doc: {
  designation?: string | null;
  title: string;
  category?: string | null;
  applicabilityNote?: string | null;
  edition?: string | null;
}): string;

export interface KbFieldRow {
  key: string;
  label: string;
  value: string;
  /** Set on the «Статус» row: the label colour. */
  badge?: KbLabelKind;
}

export interface KbSourceButton {
  href: string;
  label: string;
}

export interface KbDocumentView {
  heading: string;
  rows: KbFieldRow[];
  buttons: KbSourceButton[];
  /** The full text can be opened (collected, and not hidden by the SP switch). */
  readable: boolean;
  label: KbTextLabel | null;
  showFullTextLater: boolean;
  /** Slice 9, frame 5 A: the reason line, or «Полный текст появится в базе позже.»; null when the text is shown or the document is a card. */
  fullTextNote: string | null;
  /** Slice 9, frame 5 B: the copy notice of a text from an unofficial copy. */
  copyNotice: string | null;
}

export type KbTranslate = (key: string, vars?: Record<string, unknown>) => string;

export declare function buildKbDocumentView(
  doc: KbDocumentShape,
  t: KbTranslate,
  options?: { spFullText?: boolean },
): KbDocumentView;

export declare function sourceRowValue(url: string, t: KbTranslate): string;
