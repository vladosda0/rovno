import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { enUS, ru } from "date-fns/locale";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fromDayIndex, toDayIndex } from "@/lib/estimate-v2/schedule";
import { cn } from "@/lib/utils";

export interface MissingWorkDatesEntry {
  workId: string;
  plannedStart: string;
  plannedEnd: string;
}

interface MissingWorkDatesDialogProps {
  open: boolean;
  works: { id: string; title: string }[];
  onCancel: () => void;
  /** Dates the person entered in the dialog; the rest of the dateless works get picked dates. */
  onConfirm: (entered: MissingWorkDatesEntry[]) => void;
}

function toEntry(workId: string, range: DateRange | undefined): MissingWorkDatesEntry | null {
  const start = toDayIndex(range?.from);
  if (start == null) return null;
  // Only the start clicked so far reads as a one-day work.
  const end = toDayIndex(range?.to) ?? start;
  return {
    workId,
    plannedStart: fromDayIndex(Math.min(start, end)),
    plannedEnd: fromDayIndex(Math.max(start, end)),
  };
}

/**
 * «Отсутствуют даты работ» at «В работу» (rovno#235): each dateless work gets an optional
 * «Сроки» field with a range calendar. Nothing entered: «Пропустить настройку»; anything
 * entered: «Сохранить». «Отмена» drops what was entered.
 */
export function MissingWorkDatesDialog({ open, works, onCancel, onConfirm }: MissingWorkDatesDialogProps) {
  const { t, i18n } = useTranslation();
  const [ranges, setRanges] = useState<Record<string, DateRange | undefined>>({});

  useEffect(() => {
    if (open) setRanges({});
  }, [open]);

  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language],
  );
  const calendarLocale = i18n.language.startsWith("ru") ? ru : enUS;

  const entries = works
    .map((work) => toEntry(work.id, ranges[work.id]))
    .filter((entry): entry is MissingWorkDatesEntry => Boolean(entry));
  const hasEntries = entries.length > 0;

  return (
    <ConfirmModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={t("estimate.missingDates.title")}
      description={t("estimate.missingDates.description")}
      confirmLabel={hasEntries ? t("estimate.missingDates.save") : t("estimate.missingDates.skipSetup")}
      cancelLabel={t("common.cancel")}
      onConfirm={() => onConfirm(entries)}
      onCancel={onCancel}
    >
      <div className="max-h-[45vh] overflow-auto rounded-md border border-border p-2">
        <ul className="space-y-2">
          {works.map((work) => {
            const entry = entries.find((item) => item.workId === work.id) ?? null;
            const label = entry
              ? t("estimate.gantt.row.dateRange", {
                start: dayLabel.format(new Date(entry.plannedStart)),
                end: dayLabel.format(new Date(entry.plannedEnd)),
              })
              : t("estimate.missingDates.pickDates");
            return (
              <li key={work.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="min-w-0 break-words text-caption text-foreground">{work.title}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${t("estimate.missingDates.datesField")}: ${work.title}`}
                      className={cn("h-8 w-full shrink-0 justify-start text-caption sm:w-48", !entry && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-1.5 h-3 w-3" />
                      {label}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      locale={calendarLocale}
                      weekStartsOn={1}
                      selected={ranges[work.id]}
                      onSelect={(range) => setRanges((prev) => ({ ...prev, [work.id]: range }))}
                      className="pointer-events-auto p-3"
                    />
                  </PopoverContent>
                </Popover>
              </li>
            );
          })}
        </ul>
      </div>
    </ConfirmModal>
  );
}
