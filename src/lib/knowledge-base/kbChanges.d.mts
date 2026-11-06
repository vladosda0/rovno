// Type surface for the «Что изменилось» helpers (kbChanges.mjs).

import type { KbTranslate } from "./kbConfig.mjs";

export declare const KB_CHANGES_PATH: string;

export interface KbChangePart {
  text: string;
  /** A document slug: the part opens that document. */
  doc?: string;
  /** A solution slug: the part opens that card. */
  solution?: string;
}

export interface KbChangeEntry {
  key: string;
  iso: string;
  date: string;
  parts: KbChangePart[];
  /** The grey second line, only when there is something to add. */
  note: string | null;
}

export interface KbChangeMonth {
  key: string;
  label: string;
  entries: KbChangeEntry[];
}

export declare function normalizeKbChangeRow(row: unknown): Record<string, unknown>;
export declare function kbChangeEntry(row: unknown, t: KbTranslate, index?: number): KbChangeEntry | null;
export declare function kbMonthName(iso: string, language: string): string;
export declare function kbMonthLabel(iso: string, language: string): string;
export declare function kbChangeMonths(rows: unknown[], t: KbTranslate, language: string): KbChangeMonth[];
export declare function kbChangesMonthLine(count: number, t: KbTranslate, language: string, today: string): string | null;
