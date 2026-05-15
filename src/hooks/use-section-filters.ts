import { useCallback, useEffect, useMemo, useState } from "react";

export type DateFilterPreset =
  | "all"
  | "year"
  | "halfYear"
  | "quarter"
  | "month"
  | "week"
  | "day"
  | "custom";

export interface DateRange {
  from: Date;
  to?: Date;
}

const PRESET_DAYS: Record<Exclude<DateFilterPreset, "all" | "custom">, number> = {
  year: 365,
  halfYear: 182,
  quarter: 90,
  month: 30,
  week: 7,
  day: 1,
};

export function rangeFromPreset(preset: DateFilterPreset, now: Date = new Date()): DateRange | null {
  if (preset === "all") return null;
  if (preset === "custom") return null;
  const days = PRESET_DAYS[preset];
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to: now };
}

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSize = 25;
const STORAGE_KEY_PREFIX = "rovno:section-page-size:";

function loadPageSize(sectionSlug: string): PageSize {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sectionSlug}`);
    if (!raw) return DEFAULT_PAGE_SIZE;
    const parsed = Number(raw);
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)) return parsed as PageSize;
  } catch {
    // localStorage unavailable (SSR, privacy mode): fall through.
  }
  return DEFAULT_PAGE_SIZE;
}

function savePageSize(sectionSlug: string, size: PageSize): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${sectionSlug}`, String(size));
  } catch {
    // ignore
  }
}

export interface UseSectionFiltersInput<T> {
  items: T[];
  sectionSlug: string;
  searchKeys?: Array<(item: T) => string | null | undefined>;
  isSystemItem?: (item: T) => boolean;
  getCreatedAt?: (item: T) => string | Date | null | undefined;
}

export interface UseSectionFiltersResult<T> {
  paged: T[];
  total: number;
  totalAfterFilter: number;
  page: number;
  setPage: (page: number) => void;
  pageSize: PageSize;
  setPageSize: (size: PageSize) => void;
  search: string;
  setSearch: (value: string) => void;
  dateRange: DateRange | null;
  setDateRange: (range: DateRange | null) => void;
  preset: DateFilterPreset;
  setPreset: (preset: DateFilterPreset) => void;
  reset: () => void;
  isFilterActive: boolean;
  systemHidden: boolean;
}

function matchesSearch<T>(
  item: T,
  needle: string,
  keys: Array<(item: T) => string | null | undefined> | undefined,
): boolean {
  if (!needle) return true;
  const lowered = needle.toLowerCase();
  if (!keys || keys.length === 0) return true;
  for (const accessor of keys) {
    const value = accessor(item);
    if (value && value.toLowerCase().includes(lowered)) return true;
  }
  return false;
}

function matchesDateRange<T>(
  item: T,
  range: DateRange | null,
  getCreatedAt: ((item: T) => string | Date | null | undefined) | undefined,
): boolean {
  if (!range) return true;
  if (!getCreatedAt) return true;
  const raw = getCreatedAt(item);
  if (!raw) return false;
  const date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return false;
  if (date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

export function useSectionFilters<T>({
  items,
  sectionSlug,
  searchKeys,
  isSystemItem,
  getCreatedAt,
}: UseSectionFiltersInput<T>): UseSectionFiltersResult<T> {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<DateFilterPreset>("all");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState<PageSize>(() => loadPageSize(sectionSlug));

  // Effective date range: preset-derived OR custom user-picked.
  const dateRange: DateRange | null = useMemo(() => {
    if (preset === "custom") return customRange;
    return rangeFromPreset(preset);
  }, [preset, customRange]);

  const setDateRange = useCallback((range: DateRange | null) => {
    if (range === null) {
      setPreset("all");
      setCustomRange(null);
    } else {
      setPreset("custom");
      setCustomRange(range);
    }
  }, []);

  const setPageSize = useCallback((size: PageSize) => {
    setPageSizeState(size);
    savePageSize(sectionSlug, size);
    setPage(0);
  }, [sectionSlug]);

  // Drop system items entirely when a non-trivial date range is active.
  const dateFiltered = useMemo(() => {
    const dateActive = dateRange !== null;
    return items.filter((item) => {
      if (dateActive && isSystemItem?.(item)) return false;
      if (!matchesDateRange(item, dateRange, getCreatedAt)) return false;
      return true;
    });
  }, [items, dateRange, isSystemItem, getCreatedAt]);

  const searchFiltered = useMemo(() => {
    if (!search) return dateFiltered;
    return dateFiltered.filter((item) => matchesSearch(item, search, searchKeys));
  }, [dateFiltered, search, searchKeys]);

  // Snap page back when the filter set shrinks below the current page.
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(searchFiltered.length / pageSize) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [searchFiltered.length, pageSize, page]);

  const paged = useMemo(() => {
    const start = page * pageSize;
    return searchFiltered.slice(start, start + pageSize);
  }, [searchFiltered, page, pageSize]);

  const isFilterActive = search.length > 0 || preset !== "all" || customRange !== null;
  const systemHidden = useMemo(
    () => dateRange !== null && Boolean(isSystemItem) && items.some((item) => isSystemItem!(item)),
    [dateRange, isSystemItem, items],
  );

  const reset = useCallback(() => {
    setSearch("");
    setPreset("all");
    setCustomRange(null);
    setPage(0);
  }, []);

  return {
    paged,
    total: items.length,
    totalAfterFilter: searchFiltered.length,
    page,
    setPage,
    pageSize,
    setPageSize,
    search,
    setSearch,
    dateRange,
    setDateRange,
    preset,
    setPreset,
    reset,
    isFilterActive,
    systemHidden,
  };
}
