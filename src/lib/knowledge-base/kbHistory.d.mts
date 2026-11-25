// Type surface for the history helpers (kbHistory.mjs).

import type { KbTranslate } from "./kbConfig.mjs";

export interface KbUpcomingAmendment {
  no: number;
  url: string | null;
  effectiveFrom: string;
}

export interface KbHistoryLink {
  href: string | null;
  label: string;
  external: boolean;
}

export interface KbHistoryEntry {
  key: string;
  date: string | null;
  iso: string;
  text: string;
  link: KbHistoryLink | null;
  /** Text after the link («, ещё не вписано в текст, …»). */
  suffix: string | null;
  future: boolean;
}

export function normalizeUpcomingAmendments(raw: unknown): KbUpcomingAmendment[];
export function normalizeHistoryRow(row: unknown): Record<string, unknown>;
export function kbHistoryEntries(
  rows: unknown[],
  t: KbTranslate,
  options?: {
    appliedList?: string | null;
    docPath?: (slug: string) => string;
    pending?: Array<{ no: number; url: string | null }>;
  },
): KbHistoryEntry[];
export function kbMoscowToday(now?: Date): string;
export function kbHasUpcoming(
  doc: { docStatus?: string; upcomingAmendments?: KbUpcomingAmendment[] } | null | undefined,
  today?: string,
): boolean;
