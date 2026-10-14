/**
 * Shurik's hint of the day (epic `shurik-notifications`, slice 8).
 *
 * The server picks the hint (`shurik_hint_of_day`); this module only turns its answer into
 * words and a place to go. Texts live in the locales under `shurikHints.<hint_key>`; the
 * button's address is built here from the hint key and the ids in `params`, so a text can
 * never send a person somewhere the code does not know.
 */

export type ShurikHintStatus = "active" | "done" | "dismissed";

export type ShurikHintParams = Record<string, string | number | null | undefined>;

export interface ShurikHintOfDay {
  day: string;
  hint_key: string;
  level: number;
  params: ShurikHintParams;
  status: ShurikHintStatus;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Where the button of a hint leads: a page, or a question put into the composer (never sent). */
export type ShurikHintAction =
  | { kind: "navigate"; href: string }
  | { kind: "ask"; questionKey: string };

type HintTarget =
  | { kind: "estimate" }
  | { kind: "tasks"; taskParam?: string }
  | { kind: "procurementItem" }
  | { kind: "procurementOrder" }
  | { kind: "procurement" }
  | { kind: "home"; query: string }
  | { kind: "ask"; questionKey: string };

/**
 * One line per hint of the first release (T01-T40 without T05 and T21, which wait for their own
 * tasks). A hint key the server sends but this table does not know draws no card: a newer
 * database must not put a card with a dead button in front of an older app.
 */
const HINT_TARGETS: Record<string, HintTarget> = {
  T01: { kind: "estimate" },
  T02: { kind: "estimate" },
  T03: { kind: "estimate" },
  T04: { kind: "estimate" },
  T06: { kind: "estimate" },
  T07: { kind: "estimate" },
  T08: { kind: "estimate" },
  T09: { kind: "estimate" },
  T10: { kind: "estimate" },
  T11: { kind: "estimate" },
  T12: { kind: "estimate" },
  T13: { kind: "estimate" },
  T14: { kind: "estimate" },
  T15: { kind: "estimate" },
  T16: { kind: "estimate" },
  T17: { kind: "home", query: "tab=documents&docTab=catalogs" },
  T18: { kind: "home", query: "tab=documents&docTab=estimates" },
  T19: { kind: "tasks", taskParam: "task_id" },
  T20: { kind: "tasks", taskParam: "task_id" },
  T22: { kind: "estimate" },
  T23: { kind: "tasks", taskParam: "task_id" },
  T24: { kind: "tasks", taskParam: "task_id" },
  T25: { kind: "tasks", taskParam: "task_id" },
  T26: { kind: "tasks", taskParam: "task_id" },
  T27: { kind: "tasks" },
  T28: { kind: "tasks" },
  T29: { kind: "tasks", taskParam: "task_id" },
  T30: { kind: "tasks", taskParam: "task_id" },
  T31: { kind: "procurementItem" },
  T32: { kind: "procurementItem" },
  T33: { kind: "procurementItem" },
  T34: { kind: "procurementItem" },
  T35: { kind: "procurementOrder" },
  T36: { kind: "procurementOrder" },
  T37: { kind: "procurementOrder" },
  T38: { kind: "procurement" },
  T39: { kind: "procurement" },
  T40: { kind: "procurementOrder" },
  // "Ask Shurik" hints of part 2 that reuse an existing chat question. Their texts arrive with
  // part 2; until then `hasShurikHintText` keeps their card off the screen.
  T82: { kind: "ask", questionKey: "ai.sidebar.suggestion.whatBlocksTasks" },
  T83: { kind: "ask", questionKey: "ai.sidebar.suggestion.whatIsLeft" },
};

function paramString(params: ShurikHintParams, key: string): string | null {
  const value = params[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** The button's destination, or null for a hint this app does not know. */
export function resolveShurikHintAction(
  hint: Pick<ShurikHintOfDay, "hint_key" | "params">,
  projectId: string,
): ShurikHintAction | null {
  const target = HINT_TARGETS[hint.hint_key];
  if (!target) return null;
  const project = `/project/${encodeURIComponent(projectId)}`;
  const params = hint.params ?? {};
  switch (target.kind) {
    case "estimate":
      return { kind: "navigate", href: `${project}/estimate` };
    case "tasks": {
      const taskId = target.taskParam ? paramString(params, target.taskParam) : null;
      return {
        kind: "navigate",
        href: taskId ? `${project}/tasks?task=${encodeURIComponent(taskId)}` : `${project}/tasks`,
      };
    }
    case "procurementItem": {
      const itemId = paramString(params, "item_id");
      return { kind: "navigate", href: itemId ? `${project}/procurement/${encodeURIComponent(itemId)}` : `${project}/procurement` };
    }
    case "procurementOrder": {
      const orderId = paramString(params, "order_id");
      return {
        kind: "navigate",
        href: orderId ? `${project}/procurement/order/${encodeURIComponent(orderId)}` : `${project}/procurement`,
      };
    }
    case "procurement":
      return { kind: "navigate", href: `${project}/procurement` };
    case "home":
      return { kind: "navigate", href: `/home?${target.query}` };
    case "ask":
      return { kind: "ask", questionKey: target.questionKey };
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Values for the text. A `YYYY-MM-DD` value becomes "21 октября": the server sends dates as
 * days, and a person reads them as days of the month. Param keys per hint: the brief of slice 8,
 * section «Ключи params».
 */
export function shurikHintTextValues(params: ShurikHintParams, language: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const formatter = new Intl.DateTimeFormat(language, { day: "numeric", month: "long", timeZone: "UTC" });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && ISO_DAY.test(value)) {
      const date = new Date(`${value}T00:00:00Z`);
      values[key] = Number.isNaN(date.getTime()) ? value : formatter.format(date);
      continue;
    }
    values[key] = value;
  }
  // `days` drives the plural form of a text that names it («3 дня назад»).
  if (values.count === undefined && typeof values.days === "number") values.count = values.days;
  return values;
}

export function shurikHintTextKey(hintKey: string): string {
  return `shurikHints.${hintKey}.text`;
}

export function shurikHintButtonKey(hintKey: string): string {
  return `shurikHints.${hintKey}.button`;
}

/** Greeting buckets of the texts page, «Приветствия». */
export type ShurikGreetingSlot = "earlyMorning" | "morning" | "day" | "evening" | "night" | "monday" | "weekend";

/**
 * Which greeting fits this moment, in the person's own clock. Night wins over everything, so
 * nobody is wished a good weekend at 2 am; Monday morning and the weekend come next.
 */
export function shurikGreetingSlot(now: Date): ShurikGreetingSlot {
  const hour = now.getHours();
  const weekday = now.getDay();
  if (hour >= 22 || hour < 5) return "night";
  if (weekday === 0 || weekday === 6) return "weekend";
  if (weekday === 1 && hour < 12) return "monday";
  if (hour < 8) return "earlyMorning";
  if (hour < 12) return "morning";
  if (hour < 17) return "day";
  return "evening";
}

/** First word of the profile's full name, or null when there is none. An email is not a name. */
export function shurikGreetingName(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first && !first.includes("@") ? first : null;
}

const NO_NAME_PLACEHOLDER = "Unknown user";

/** The profile's own full name: the user mapping falls back to the email or a placeholder, which are not names. */
export function profileFullName(user: { name?: string | null; email?: string | null } | null | undefined): string | null {
  const name = user?.name?.trim();
  if (!name || name === NO_NAME_PLACEHOLDER || name === user?.email?.trim()) return null;
  return name;
}

/** The composer placeholder: a greeting by time of day, with the name when the profile has one. */
export function shurikGreeting(t: Translate, now: Date, fullName: string | null | undefined): string {
  const slot = shurikGreetingSlot(now);
  const name = shurikGreetingName(fullName);
  return name
    ? t(`shurikHints.greeting.${slot}.named`, { name })
    : t(`shurikHints.greeting.${slot}.plain`);
}
