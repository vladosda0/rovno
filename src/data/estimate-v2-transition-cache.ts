export interface EstimateV2HeroTransitionIds {
  estimateId: string;
  versionId: string;
  eventId: string;
  stageIdByLocalStageId: Record<string, string>;
  workIdByLocalWorkId: Record<string, string>;
  lineIdByLocalLineId: Record<string, string>;
  taskIdByLocalWorkId: Record<string, string>;
  checklistItemIdByLocalLineId: Record<string, string>;
  procurementItemIdByLocalLineId: Record<string, string>;
  hrItemIdByLocalLineId: Record<string, string>;
}

export interface EstimateV2HeroTransitionCacheRecord {
  version: 1;
  projectId: string;
  fingerprint: string;
  status: "pending" | "completed";
  ids: EstimateV2HeroTransitionIds;
  updatedAt: string;
}

export interface EstimateV2HeroTransitionBlockedRecord {
  projectId: string;
  fingerprint: string;
  reason: string;
  updatedAt: string;
}

const CACHE_KEY_PREFIX = "estimate-v2-hero-transition";
const BLOCKED_KEY_PREFIX = "estimate-v2-hero-transition-blocked";

function cacheKey(projectId: string): string {
  return `${CACHE_KEY_PREFIX}:${projectId}`;
}

function blockedKey(projectId: string): string {
  return `${BLOCKED_KEY_PREFIX}:${projectId}`;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(storage: Storage | null, key: string): T | null {
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: Storage | null, key: string, value: unknown) {
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function loadEstimateV2HeroTransitionCache(
  projectId: string,
): EstimateV2HeroTransitionCacheRecord | null {
  const value = readJson<EstimateV2HeroTransitionCacheRecord>(safeLocalStorage(), cacheKey(projectId));
  if (!value || value.version !== 1 || value.projectId !== projectId) {
    return null;
  }
  return value;
}

export function saveEstimateV2HeroTransitionPending(input: {
  projectId: string;
  fingerprint: string;
  ids: EstimateV2HeroTransitionIds;
}): EstimateV2HeroTransitionCacheRecord {
  const record: EstimateV2HeroTransitionCacheRecord = {
    version: 1,
    projectId: input.projectId,
    fingerprint: input.fingerprint,
    status: "pending",
    ids: input.ids,
    updatedAt: new Date().toISOString(),
  };
  writeJson(safeLocalStorage(), cacheKey(input.projectId), record);
  return record;
}

export function saveEstimateV2HeroTransitionCompleted(input: {
  projectId: string;
  fingerprint: string;
  ids: EstimateV2HeroTransitionIds;
}): EstimateV2HeroTransitionCacheRecord {
  const record: EstimateV2HeroTransitionCacheRecord = {
    version: 1,
    projectId: input.projectId,
    fingerprint: input.fingerprint,
    status: "completed",
    ids: input.ids,
    updatedAt: new Date().toISOString(),
  };
  writeJson(safeLocalStorage(), cacheKey(input.projectId), record);
  clearEstimateV2HeroTransitionBlocked(input.projectId);
  return record;
}

export function loadEstimateV2HeroTransitionBlocked(
  projectId: string,
): EstimateV2HeroTransitionBlockedRecord | null {
  const value = readJson<EstimateV2HeroTransitionBlockedRecord>(safeSessionStorage(), blockedKey(projectId));
  if (!value || value.projectId !== projectId) {
    return null;
  }
  return value;
}

export function saveEstimateV2HeroTransitionBlocked(input: {
  projectId: string;
  fingerprint: string;
  reason: string;
}): EstimateV2HeroTransitionBlockedRecord {
  const record: EstimateV2HeroTransitionBlockedRecord = {
    projectId: input.projectId,
    fingerprint: input.fingerprint,
    reason: input.reason,
    updatedAt: new Date().toISOString(),
  };
  writeJson(safeSessionStorage(), blockedKey(input.projectId), record);
  return record;
}

export function clearEstimateV2HeroTransitionBlocked(projectId: string) {
  const storage = safeSessionStorage();
  if (!storage) return;
  storage.removeItem(blockedKey(projectId));
}
