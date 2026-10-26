import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAYS_PER_PERSON,
  HARD_CAP_DAYS,
  MAX_ACTIVE_FEATURES,
  NEW_FEATURES,
  NEW_FEATURES_STORAGE_KEY,
  anyNew,
  isFeatureNew,
  markFeatureOpened,
  markFeatureSeen,
  newFeatureIdsForHomeTab,
  resetNewFeaturesForTests,
} from "@/lib/new-features";

const DAY = 24 * 60 * 60 * 1000;
const ID = "knowledge-base";
const addedAt = Date.parse(NEW_FEATURES.find((f) => f.id === ID)!.addedAt);

describe("new-features", () => {
  beforeEach(() => {
    localStorage.clear();
    resetNewFeaturesForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the registry at three active features or fewer", () => {
    expect(NEW_FEATURES.length).toBeLessThanOrEqual(MAX_ACTIVE_FEATURES);
    expect(new Set(NEW_FEATURES.map((f) => f.id)).size).toBe(NEW_FEATURES.length);
  });

  it("is new for a person who has never seen or opened it", () => {
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(true);
  });

  it("is not new for an id outside the registry", () => {
    expect(isFeatureNew("nope", addedAt + DAY)).toBe(false);
  });

  it("stops being new once opened, and stays so after a reload", () => {
    markFeatureOpened(ID, addedAt + DAY);
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(false);
    const stored = JSON.parse(localStorage.getItem(NEW_FEATURES_STORAGE_KEY)!);
    expect(stored[ID].openedAt).toBeTruthy();
  });

  it("expires 30 days after it was first shown to this person", () => {
    const firstShown = addedAt + 10 * DAY;
    markFeatureSeen(ID, firstShown);
    expect(isFeatureNew(ID, firstShown + (DAYS_PER_PERSON - 1) * DAY)).toBe(true);
    expect(isFeatureNew(ID, firstShown + DAYS_PER_PERSON * DAY + 1)).toBe(false);
  });

  it("does not move the first-shown date on later shows", () => {
    markFeatureSeen(ID, addedAt + DAY);
    markFeatureSeen(ID, addedAt + 20 * DAY);
    expect(isFeatureNew(ID, addedAt + (DAYS_PER_PERSON + 2) * DAY)).toBe(false);
  });

  it("expires for everyone 90 days after it was added, even if never shown", () => {
    expect(isFeatureNew(ID, addedAt + (HARD_CAP_DAYS - 1) * DAY)).toBe(true);
    expect(isFeatureNew(ID, addedAt + HARD_CAP_DAYS * DAY + 1)).toBe(false);
  });

  it("shows nothing and throws nothing when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(false);
    expect(() => markFeatureSeen(ID, addedAt + DAY)).not.toThrow();
    expect(() => markFeatureOpened(ID, addedAt + DAY)).not.toThrow();
  });

  it("treats a corrupted stored value as a clean slate", () => {
    localStorage.setItem(NEW_FEATURES_STORAGE_KEY, "{not json");
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(true);
  });

  it("anyNew is true while at least one listed feature is unopened", () => {
    expect(anyNew([ID], addedAt + DAY)).toBe(true);
    markFeatureOpened(ID, addedAt + DAY);
    expect(anyNew([ID], addedAt + DAY)).toBe(false);
    expect(anyNew([], addedAt + DAY)).toBe(false);
  });

  it("maps the documents home tab to the knowledge base", () => {
    expect(newFeatureIdsForHomeTab("documents")).toEqual([ID]);
    expect(newFeatureIdsForHomeTab("tasks")).toEqual([]);
  });
  it("shows nothing once a write fails, so a mark that cannot be cleared never sticks", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(true);
    markFeatureOpened(ID, addedAt + DAY);
    expect(isFeatureNew(ID, addedAt + DAY)).toBe(false);
  });

  it("treats an unparseable first-shown date as missing and repairs it on the next show", () => {
    localStorage.setItem(NEW_FEATURES_STORAGE_KEY, JSON.stringify({ [ID]: { firstSeenAt: "x" } }));
    const shown = addedAt + DAY;
    markFeatureSeen(ID, shown);
    expect(isFeatureNew(ID, shown + (DAYS_PER_PERSON - 1) * DAY)).toBe(true);
    expect(isFeatureNew(ID, shown + DAYS_PER_PERSON * DAY + 1)).toBe(false);
  });
  it("re-stamps a first-shown date that lies in the future (clock was ahead)", () => {
    const now = addedAt + DAY;
    localStorage.setItem(NEW_FEATURES_STORAGE_KEY, JSON.stringify({ [ID]: { firstSeenAt: new Date(now + 60 * DAY).toISOString() } }));
    markFeatureSeen(ID, now);
    expect(isFeatureNew(ID, now + DAYS_PER_PERSON * DAY + 1)).toBe(false);
  });
});
