/**
 * The chat chips under an empty project thread, and the neutral line above them.
 *
 * Slice 8 of `shurik-notifications` (2026-10-15) took the statements out of this block: the ten
 * signals («Заблокировано задач: 2.» and the rest), the three-day introduction and the fade are
 * gone, and what Shurik has to say about the project now comes as the hint of the day, picked by
 * the server (`src/lib/shurik-hints.ts`). What stays here is the chip row, still ordered by how
 * far the tasks have got, and the neutral «Спроси про проект: …» line for when no hint is shown.
 *
 * Pure: everything arrives in one object, so the role and the permission-aware pack are
 * substitutable in tests.
 */

import type { AIContextPack } from "@/lib/ai-project-context";

/** Domains a chip can lead into. */
export type OpenerDomain = "project" | "estimate" | "tasks" | "procurement" | "participants" | "documents";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface SidebarOpenerInput {
  /** `null` while the seam loads or the pack could not be built. */
  ctx: AIContextPack | null;
  /** Mobile width: two chips instead of three. */
  compact: boolean;
  /** Chips render disabled and a credits line is added (section 5.7). */
  quotaExhausted: boolean;
  /**
   * The "report for the client" chip opens the client report dialog, which only
   * an owner or co-owner on the real backend has. Without it the chip is left out.
   */
  clientReport?: boolean;
  t: Translate;
}

export interface OpenerChip {
  /** Locale key, so analytics reports a stable id rather than translated text. */
  key: string;
  text: string;
}

export interface SidebarOpenerResult {
  /** The neutral line; the panel leaves it out while a hint card is on screen. */
  lines: string[];
  chips: OpenerChip[];
  /** Which chip set was used, for `ai_opener_shown`. */
  signals: string[];
  quotaNote?: string;
}

const SUGGESTION = "ai.sidebar.suggestion.";
const OPENER = "ai.sidebar.opener.";
const CLIENT_REPORT_CHIP = `${SUGGESTION}clientStatus`;

/**
 * Explicit opt-out via `VITE_AI_SIDEBAR_OPENER` (requirement 6.11). When on, the
 * sidebar behaves exactly as it did before this feature: the old chip row returns
 * and nothing new renders. Same shape as `isLiveTextHostedKillSwitchEnabled`.
 */
export function isSidebarOpenerKillSwitchEnabled(): boolean {
  const v = import.meta.env.VITE_AI_SIDEBAR_OPENER;
  if (v === undefined || v === null) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "") return false;
  return s === "0" || s === "false" || s === "no" || s === "off";
}

/** Which domain a chip leads into, for requirement 6.13. `null` = no domain gate. */
const CHIP_DOMAIN: Record<string, OpenerDomain | null> = {
  [`${SUGGESTION}addTasks`]: "tasks",
  [`${SUGGESTION}updateEstimate`]: "estimate",
  [`${SUGGESTION}generateContract`]: "documents",
  [`${SUGGESTION}buyMaterials`]: "procurement",
  [`${SUGGESTION}draftWeeklyReport`]: null,
  [`${SUGGESTION}nextRiskyTasks`]: "tasks",
  [`${SUGGESTION}suggestSchedule`]: "tasks",
  [`${SUGGESTION}proposeMaterials`]: "estimate",
  [`${SUGGESTION}draftInvite`]: "participants",
  [`${SUGGESTION}compareEstimates`]: "estimate",
  [`${SUGGESTION}estimateFromDescription`]: "estimate",
  [`${SUGGESTION}estimateFromTasks`]: "estimate",
  [`${SUGGESTION}fillEstimate`]: "estimate",
  [`${SUGGESTION}whatBlocksTasks`]: "tasks",
  [`${SUGGESTION}whatToOrderFirst`]: "procurement",
  [`${SUGGESTION}whatIsLeft`]: "tasks",
  [`${SUGGESTION}clientStatus`]: null,
  [`${SUGGESTION}finalReport`]: null,
  [`${SUGGESTION}writeOffStock`]: "procurement",
};

/** Used to top up a set the domain filter left short, in this order. */
const FILLER_CHIPS = [
  `${SUGGESTION}nextRiskyTasks`,
  `${SUGGESTION}updateEstimate`,
  `${SUGGESTION}buyMaterials`,
  `${SUGGESTION}draftWeeklyReport`,
  `${SUGGESTION}suggestSchedule`,
];

/**
 * Chip sets keyed by how far the tasks have got. These are prompts for an assistant that has
 * its own context, not statements about the project, so they outlived the signals they used to
 * follow. The client report chip comes with the finished and nearly finished sets.
 */
interface ChipSet {
  id: string;
  test: (ctx: AIContextPack) => boolean;
  chips: string[];
}

const CHIP_SETS: ChipSet[] = [
  {
    id: "allDone",
    test: (c) => Boolean(c.tasks && c.tasks.total > 0 && c.tasks.done === c.tasks.total),
    chips: [`${SUGGESTION}finalReport`, `${SUGGESTION}clientStatus`, `${SUGGESTION}compareEstimates`],
  },
  {
    id: "blocked",
    test: (c) => Boolean(c.tasks && c.tasks.blocked > 0),
    chips: [`${SUGGESTION}whatBlocksTasks`, `${SUGGESTION}nextRiskyTasks`, `${SUGGESTION}suggestSchedule`],
  },
  {
    id: "almostDone",
    test: (c) =>
      Boolean(c.tasks && c.tasks.total >= 5 && c.tasks.done < c.tasks.total && c.tasks.done / c.tasks.total >= 0.9),
    chips: [`${SUGGESTION}whatIsLeft`, `${SUGGESTION}clientStatus`, `${SUGGESTION}draftWeeklyReport`],
  },
];

/** Which domains this user can be told about at all. */
function visibleDomains(ctx: AIContextPack): Set<OpenerDomain> {
  const visible = new Set<OpenerDomain>(["project"]);
  if (ctx.tasks) visible.add("tasks");
  if (ctx.estimate) visible.add("estimate");
  if (ctx.procurement) visible.add("procurement");
  if (ctx.members !== null) visible.add("participants");
  if (!ctx._meta.hiddenDomains.includes("documents")) visible.add("documents");
  return visible;
}

function chipsFor(
  set: ChipSet | null,
  ctx: AIContextPack | null,
  wanted: number,
  t: Translate,
  clientReport: boolean,
): OpenerChip[] {
  const allowed = ctx ? visibleDomains(ctx) : null;
  const passes = (key: string) => {
    if (key === CLIENT_REPORT_CHIP && !clientReport) return false;
    const domain = CHIP_DOMAIN[key];
    if (domain === null || domain === undefined) return true;
    // Before the pack exists nothing is known to be visible, so only ungated
    // chips are offered: requirement 6.6 covers chips as well as numbers.
    return allowed ? allowed.has(domain) : false;
  };

  const ordered = [...(set?.chips ?? []), ...FILLER_CHIPS];
  const picked: string[] = [];
  for (const key of ordered) {
    if (picked.length >= wanted) break;
    if (!key || picked.includes(key) || !passes(key)) continue;
    picked.push(key);
  }
  return picked.map((key) => ({ key, text: t(key) }));
}

/**
 * Build the block for one render. Never throws: a missing pack degrades to the
 * pre-context line, which carries no domain list.
 */
export function buildSidebarOpener(input: SidebarOpenerInput): SidebarOpenerResult {
  const { ctx, compact, quotaExhausted, t } = input;
  const clientReport = input.clientReport === true;
  const chipCount = compact ? 2 : 3;
  const quotaNote = quotaExhausted ? t(`${OPENER}quotaExhausted`) : undefined;

  // Requirement 6.6: no domain list until the pack is built.
  if (!ctx) {
    return {
      lines: [t(`${OPENER}signal.fallbackNoContext`)],
      chips: chipsFor(null, null, chipCount, t, clientReport),
      signals: ["S00n"],
      quotaNote,
    };
  }

  const domains = [...visibleDomains(ctx)].filter(
    (d): d is Exclude<OpenerDomain, "project"> => d !== "project",
  );
  const set = CHIP_SETS.find((candidate) => candidate.test(ctx)) ?? null;
  return {
    lines: [
      t(`${OPENER}signal.fallback`, {
        domains: domains.map((d) => t(`${OPENER}domain.${d}`)).join(", "),
      }),
    ],
    chips: chipsFor(set, ctx, chipCount, t, clientReport),
    signals: [set ? `S00:${set.id}` : "S00"],
    quotaNote,
  };
}
