// Type surface for the «Решения» helpers (kbSolutions.mjs).

export interface KbSolutionOption {
  key: string;
  label: string;
}

export interface KbSolutionCondition {
  key: string;
  label: string;
  options: KbSolutionOption[];
}

/** condition key → option key */
export type KbSolutionChoice = Record<string, string>;

export interface KbSolutionItem {
  text: string;
  /** Positions of the cited facts. */
  facts: number[];
  when: KbSolutionChoice | null;
  recommendation: boolean;
}

export interface KbSolutionNumber extends KbSolutionItem {
  what: string;
  value: string;
}

export interface KbSolutionFact {
  position: number;
  fact: string;
  docId: string;
  docSlug: string | null;
  designation: string | null;
  anchor: string | null;
  quote: string | null;
}

export interface KbSolution {
  slug: string;
  title: string;
  summary: string | null;
  checkedAt: string | null;
  recheckSince: string | null;
  updatedAt: string | null;
  conditions: KbSolutionCondition[];
  steps: KbSolutionItem[];
  numbers: KbSolutionNumber[];
  acceptance: KbSolutionItem[];
  divergences: KbSolutionItem[];
  facts: KbSolutionFact[];
}

export interface KbFactChip {
  key: string;
  label: string;
  heading: string;
  /** The quotes of every fact cited from this clause, in fact order. */
  quotes: string[];
  docSlug: string | null;
  anchor: string | null;
}

export declare const KB_SOLUTIONS_PATH: string;
export declare const KB_SOLUTION_SELECT: string;
export declare const KB_SOLUTION_SECTIONS: Array<"steps" | "numbers" | "acceptance">;
export declare function kbSolutionPath(slug: string): string;
export declare function normalizeKbSolution(row: Record<string, unknown> | null | undefined): KbSolution;
export declare function sortKbSolutions(solutions: KbSolution[]): KbSolution[];
export declare function kbDefaultChoice(solution: KbSolution): KbSolutionChoice;
export declare function kbItemVisible(entry: { when: KbSolutionChoice | null }, choice: KbSolutionChoice | null | undefined): boolean;
export declare function kbShortDesignation(designation: string | null | undefined): string;
export declare function kbClauseLabel(anchor: string | null | undefined): string | null;
export declare function kbFactChip(fact: KbSolutionFact): KbFactChip;
export declare function kbItemChips(solution: KbSolution, entry: KbSolutionItem): KbFactChip[];
export declare function kbSolutionDocuments(solution: KbSolution): string[];
export declare function kbMoscowIsoDate(value: string | null | undefined): string | null;
export declare function kbSolutionCheckedDate(solution: KbSolution): string | null;
export declare function kbSolutionMatches(solution: KbSolution, query: string): boolean;
