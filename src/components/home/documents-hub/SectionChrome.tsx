import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search, CalendarRange, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PageSizeSelector } from "@/components/ui/page-size-selector";
import { cn } from "@/lib/utils";
import {
  type DateFilterPreset,
  type DateRange,
  type PageSize,
} from "@/hooks/use-section-filters";

const PRESETS: Array<{ value: Exclude<DateFilterPreset, "custom">; labelKey: string }> = [
  { value: "all", labelKey: "home.documentsHub.dateFilter.allTime" },
  { value: "year", labelKey: "home.documentsHub.dateFilter.year" },
  { value: "halfYear", labelKey: "home.documentsHub.dateFilter.halfYear" },
  { value: "quarter", labelKey: "home.documentsHub.dateFilter.quarter" },
  { value: "month", labelKey: "home.documentsHub.dateFilter.month" },
  { value: "week", labelKey: "home.documentsHub.dateFilter.week" },
  { value: "day", labelKey: "home.documentsHub.dateFilter.day" },
];

interface SectionChromeProps {
  title: string;
  subtitle?: string;
  search: string;
  onSearchChange: (value: string) => void;
  preset: DateFilterPreset;
  onPresetChange: (preset: DateFilterPreset) => void;
  dateRange: DateRange | null;
  onDateRangeChange: (range: DateRange | null) => void;
  pageSize: PageSize;
  onPageSizeChange: (size: PageSize) => void;
  page: number;
  onPageChange: (page: number) => void;
  totalAfterFilter: number;
  isFilterActive: boolean;
  onReset: () => void;
  systemHidden: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

export function SectionChrome({
  title,
  subtitle,
  search,
  onSearchChange,
  preset,
  onPresetChange,
  dateRange,
  onDateRangeChange,
  pageSize,
  onPageSizeChange,
  page,
  onPageChange,
  totalAfterFilter,
  isFilterActive,
  onReset,
  systemHidden,
  headerExtra,
  children,
}: SectionChromeProps) {
  const { t } = useTranslation();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const totalPages = Math.max(1, Math.ceil(totalAfterFilter / pageSize));
  const hasPagination = totalAfterFilter > pageSize;

  const filterLabel = (() => {
    if (preset === "all") return t("home.documentsHub.dateFilter.allTime");
    if (preset === "custom") {
      if (dateRange?.from && dateRange?.to) {
        return `${formatDate(dateRange.from)} – ${formatDate(dateRange.to)}`;
      }
      if (dateRange?.from) return `${formatDate(dateRange.from)} –`;
      return t("home.documentsHub.dateFilter.custom");
    }
    const preset_match = PRESETS.find((p) => p.value === preset);
    return preset_match ? t(preset_match.labelKey) : t("home.documentsHub.dateFilter.allTime");
  })();

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-caption text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {headerExtra}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("home.documentsHub.chrome.searchPlaceholder")}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
            aria-label={t("home.documentsHub.chrome.searchPlaceholder")}
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              <span>{filterLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <div className="flex flex-col gap-1">
              {PRESETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onPresetChange(option.value);
                    if (option.value === "all") onDateRangeChange(null);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-left text-body-sm transition-colors",
                    preset === option.value
                      ? "bg-accent/10 text-accent font-medium"
                      : "hover:bg-muted",
                  )}
                >
                  {t(option.labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCalendarOpen((open) => !open)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-left text-body-sm transition-colors",
                  preset === "custom" ? "bg-accent/10 text-accent font-medium" : "hover:bg-muted",
                )}
              >
                {t("home.documentsHub.dateFilter.custom")}
              </button>
              {(calendarOpen || preset === "custom") && (
                <div className="mt-2 border-t border-border pt-2">
                  <Calendar
                    mode="range"
                    selected={
                      dateRange
                        ? { from: dateRange.from, to: dateRange.to }
                        : undefined
                    }
                    onSelect={(range) => {
                      if (!range || (!range.from && !range.to)) {
                        onDateRangeChange(null);
                        return;
                      }
                      onDateRangeChange({
                        from: range.from ?? new Date(),
                        to: range.to,
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5"
          onClick={onReset}
          disabled={!isFilterActive}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("home.documentsHub.chrome.reset")}
        </Button>
      </div>

      {systemHidden && (
        <p className="text-caption text-muted-foreground italic">
          {t("home.documentsHub.chrome.systemHiddenHint")}
        </p>
      )}

      <div>{children}</div>

      {hasPagination && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <PageSizeSelector
            value={pageSize}
            onValueChange={onPageSizeChange}
            label={t("home.documentsHub.chrome.pageSize")}
            ariaLabel={t("home.documentsHub.chrome.pageSize")}
          />
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">
              {t("home.documentsHub.chrome.page", { current: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(Math.max(0, page - 1))}
              disabled={page === 0}
              aria-label={t("home.documentsHub.chrome.prevPage")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              aria-label={t("home.documentsHub.chrome.nextPage")}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </footer>
      )}
    </section>
  );
}
