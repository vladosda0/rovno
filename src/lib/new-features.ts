import { useCallback, useSyncExternalStore } from "react";

/**
 * «Новое» marks on a release's highlighted features (rovno#274).
 *
 * A mark disappears for a person once they open the feature, or 30 days after
 * it was first shown to them. It also disappears for everyone 90 days after
 * `addedAt`, because the prod release date is not known in code. What a person
 * has seen and opened is remembered in this browser only; if localStorage is
 * unavailable no mark is shown at all.
 */
export interface NewFeature {
  id: string;
  /** ISO date the feature entered the registry. */
  addedAt: string;
  /** Home tab (`/home?tab=`) that holds the feature, for the section dot. */
  homeTab: string;
}

export const NEW_FEATURES: readonly NewFeature[] = [
  { id: "knowledge-base", addedAt: "2026-10-26", homeTab: "documents" },
  { id: "contractor-card", addedAt: "2026-11-01", homeTab: "documents" },
];

export const MAX_ACTIVE_FEATURES = 3;
export const DAYS_PER_PERSON = 30;
export const HARD_CAP_DAYS = 90;
export const NEW_FEATURES_STORAGE_KEY = "rovno.newFeatures.v1";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHANGE_EVENT = "rovno:new-features-change";

// Set when a write failed: a mark that cannot be cleared is not shown at all.
let writeFailed = false;

interface FeatureState {
  firstSeenAt?: string;
  openedAt?: string;
}

type StoredState = Record<string, FeatureState>;

/** `null` means localStorage cannot be read: show no marks. */
function readState(): StoredState | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(NEW_FEATURES_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as StoredState) : {};
  } catch {
    return {};
  }
}

function writeState(state: StoredState): void {
  try {
    localStorage.setItem(NEW_FEATURES_STORAGE_KEY, JSON.stringify(state));
  } catch {
    writeFailed = true;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

function findFeature(id: string): NewFeature | undefined {
  return NEW_FEATURES.find((feature) => feature.id === id);
}

/** An unparseable or future first-shown date counts as missing, so the next show re-stamps it. */
function firstSeenTime(entry: FeatureState | undefined, now: number): number | null {
  const time = entry?.firstSeenAt ? Date.parse(entry.firstSeenAt) : NaN;
  return Number.isFinite(time) && time <= now ? time : null;
}

export function isFeatureNew(id: string, now: number = Date.now()): boolean {
  const feature = findFeature(id);
  if (!feature) return false;
  if (now - Date.parse(feature.addedAt) > HARD_CAP_DAYS * DAY_MS) return false;
  if (writeFailed) return false;
  const state = readState();
  if (!state) return false;
  const entry = state[id];
  if (entry?.openedAt) return false;
  const firstSeen = firstSeenTime(entry, now);
  if (firstSeen !== null && now - firstSeen > DAYS_PER_PERSON * DAY_MS) return false;
  return true;
}

export function anyNew(ids: readonly string[], now: number = Date.now()): boolean {
  return ids.some((id) => isFeatureNew(id, now));
}

/** Starts the person's 30-day clock the first time a mark is shown. */
export function markFeatureSeen(id: string, now: number = Date.now()): void {
  if (!isFeatureNew(id, now)) return;
  const state = readState();
  if (!state || firstSeenTime(state[id], now) !== null) return;
  writeState({ ...state, [id]: { ...state[id], firstSeenAt: new Date(now).toISOString() } });
}

export function markFeatureOpened(id: string, now: number = Date.now()): void {
  if (!findFeature(id)) return;
  const state = readState();
  if (!state || state[id]?.openedAt) return;
  writeState({ ...state, [id]: { ...state[id], openedAt: new Date(now).toISOString() } });
}

/** Test hook: forget a failed write between cases. */
export function resetNewFeaturesForTests(): void {
  writeFailed = false;
}

export function newFeatureIdsForHomeTab(tab: string): string[] {
  return NEW_FEATURES.filter((feature) => feature.homeTab === tab).map((feature) => feature.id);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True while any of `ids` should carry a mark; re-renders when a mark is cleared. */
export function useAnyNewFeature(ids: readonly string[]): boolean {
  const key = ids.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getSnapshot = useCallback(() => anyNew(ids), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useNewFeature(id: string | undefined): boolean {
  return useAnyNewFeature(id ? [id] : []);
}
