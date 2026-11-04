// Type surface for the full-text helpers (kbFullText.mjs).

import type { KbTranslate } from "./kbConfig.mjs";
import type { KbUpcomingAmendment } from "./kbHistory.mjs";

export type KbDocStatus = "active" | "replaced" | "cancelled";
export type KbLabelKind = "verified" | "checking" | "inactive";

export interface KbPendingAmendment {
  no: number;
  /** The amendment's page on the Minstroy site; null when it was not found there. */
  url: string | null;
}

export interface KbFullTextFields {
  docStatus: KbDocStatus;
  docStatusSince: string | null;
  replacedBy: string | null;
  editionDate: string | null;
  textCheckedAt: string | null;
  textSourceUrl: string | null;
  textPdfUrl: string | null;
  textLabel: "verified" | "checking" | null;
  textBaseYear: number | null;
  appliedAmendments: number[];
  pendingAmendments: KbPendingAmendment[];
  recognizedFromScan: boolean;
  /** Approved amendments not in force yet (slice 7): the clock in the green label. */
  upcomingAmendments: KbUpcomingAmendment[];
}

export interface KbClause {
  anchor: string;
  number: string | null;
  level: number;
  heading: string | null;
  body: string;
  position: number;
  amendments: number[];
}

export interface KbTextLabel {
  kind: KbLabelKind;
  text: string;
}

export interface KbTocEntry {
  anchor: string;
  label: string;
  level: number;
}

export interface KbSearchMatch {
  anchor: string;
  field: "heading" | "body";
  start: number;
  end: number;
}

export interface KbHighlightPiece {
  text: string;
  hit: boolean;
  current: boolean;
}

type KbDocLike = KbFullTextFields & { fullTextAvailable: boolean; folder: string };

export declare function normalizeKbFullTextFields(row: unknown): KbFullTextFields;
export declare function normalizeKbClause(row: unknown): KbClause;
export declare function kbFullTextReadable(doc: KbDocLike | null | undefined, spFullTextEnabled: boolean | undefined): boolean;
export declare function amendmentList(numbers: number[]): string;
export declare function kbTextLabel(doc: KbDocLike | null | undefined, t: KbTranslate): KbTextLabel | null;
export declare function kbEditionLine(doc: KbDocLike | null | undefined, t: KbTranslate, options?: { short?: boolean }): string | null;
export declare function kbPendingAmendmentsView(doc: KbDocLike): {
  linked: KbPendingAmendment[];
  missing: number[];
  missingList: string;
};
export declare function kbToc(clauses: KbClause[]): { main: KbTocEntry[]; back: KbTocEntry[] };
export declare function kbSectionAnchor(clauses: KbClause[], anchor: string): string | null;
export declare function kbSearchMatches(clauses: KbClause[], query: string): KbSearchMatch[];
export declare function kbHighlight(
  text: string,
  matches: Array<{ start: number; end: number; index: number }>,
  current?: number,
): KbHighlightPiece[];
export declare function kbClauseUrl(origin: string, slug: string, anchor: string): string;
export declare function kbAnchorFromHash(hash: string): string | null;
