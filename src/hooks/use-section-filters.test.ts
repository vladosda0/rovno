import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSectionFilters, rangeFromPreset } from "@/hooks/use-section-filters";

interface SampleItem {
  id: string;
  title: string;
  createdAt: string;
  isSystem?: boolean;
}

const NOW = new Date("2026-05-14T12:00:00Z");
const TWO_MONTHS_AGO = new Date("2026-03-14T12:00:00Z").toISOString();
const YESTERDAY = new Date("2026-05-13T12:00:00Z").toISOString();

const ITEMS: SampleItem[] = [
  { id: "1", title: "Recent doc", createdAt: YESTERDAY },
  { id: "2", title: "Old doc", createdAt: TWO_MONTHS_AGO },
  { id: "3", title: "System template", createdAt: TWO_MONTHS_AGO, isSystem: true },
];

function setup(items: SampleItem[]) {
  return renderHook(() =>
    useSectionFilters<SampleItem>({
      items,
      sectionSlug: "test",
      searchKeys: [(i) => i.title],
      isSystemItem: (i) => Boolean(i.isSystem),
      getCreatedAt: (i) => i.createdAt,
    }),
  );
}

describe("useSectionFilters", () => {
  it("returns all items when no filter is active", () => {
    const { result } = setup(ITEMS);
    expect(result.current.paged).toHaveLength(3);
    expect(result.current.isFilterActive).toBe(false);
    expect(result.current.systemHidden).toBe(false);
  });

  it("filters by search", () => {
    const { result } = setup(ITEMS);
    act(() => result.current.setSearch("Old"));
    expect(result.current.paged.map((i) => i.id)).toEqual(["2"]);
    expect(result.current.isFilterActive).toBe(true);
  });

  it("hides system items when a date filter is active and marks systemHidden true", () => {
    const { result } = setup(ITEMS);
    act(() => result.current.setPreset("week"));
    // Date filter active: system item is dropped, old doc outside window is also dropped.
    expect(result.current.paged.map((i) => i.id)).toEqual(["1"]);
    expect(result.current.systemHidden).toBe(true);
  });

  it("reset clears search and date filter", () => {
    const { result } = setup(ITEMS);
    act(() => result.current.setSearch("Recent"));
    act(() => result.current.setPreset("week"));
    act(() => result.current.reset());
    expect(result.current.search).toBe("");
    expect(result.current.preset).toBe("all");
    expect(result.current.paged).toHaveLength(3);
    expect(result.current.isFilterActive).toBe(false);
  });
});

describe("rangeFromPreset", () => {
  it("returns null for 'all' and 'custom'", () => {
    expect(rangeFromPreset("all", NOW)).toBeNull();
    expect(rangeFromPreset("custom", NOW)).toBeNull();
  });

  it("returns a range whose 'from' is N days before now", () => {
    const range = rangeFromPreset("week", NOW);
    expect(range).not.toBeNull();
    if (!range) return;
    const diffDays = (NOW.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 0);
  });
});
