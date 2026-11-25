import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildMonthTicks,
  buildWeekTicks,
  fromDayIndex,
} from "@/lib/estimate-v2/schedule";

export type GanttScale = "days" | "weeks" | "months";

interface GanttHeaderProps {
  scale: GanttScale;
  timelineStartDay: number;
  timelineEndDay: number;
  visibleStartDay: number;
  visibleEndDay: number;
  pxPerDay: number;
  width: number;
}

function dayToDate(dayIndex: number): Date {
  return new Date(fromDayIndex(dayIndex));
}

export function GanttHeader({
  scale,
  timelineStartDay,
  timelineEndDay,
  visibleStartDay,
  visibleEndDay,
  pxPerDay,
  width,
}: GanttHeaderProps) {
  const { t, i18n } = useTranslation();
  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language],
  );
  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", year: "numeric" }),
    [i18n.language],
  );
  // «Недели» in two tiers (rovno#235): «Октябрь 2026» above, the dates of each week below.
  const monthNameLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "long" }),
    [i18n.language],
  );
  const weekDayNumber = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: "numeric" }),
    [i18n.language],
  );
  const weekLabel = (weekStartDay: number): string => {
    const start = dayToDate(weekStartDay);
    const end = dayToDate(weekStartDay + 6);
    if (start.getMonth() === end.getMonth()) {
      return t("estimate.gantt.header.weekRange", { start: weekDayNumber.format(start), end: weekDayNumber.format(end) });
    }
    return t("estimate.gantt.header.weekRangeAcrossMonths", { start: dayLabel.format(start), end: dayLabel.format(end) });
  };
  const monthTitle = (date: Date): string => {
    const name = monthNameLabel.format(date);
    return t("estimate.gantt.header.month", {
      month: name.charAt(0).toLocaleUpperCase(i18n.language) + name.slice(1),
      year: date.getFullYear(),
    });
  };
  const monthSeparators: number[] = [];
  for (let day = Math.max(timelineStartDay, visibleStartDay - 2); day <= Math.min(timelineEndDay, visibleEndDay + 2); day += 1) {
    const date = dayToDate(day);
    if (date.getDate() === 1) monthSeparators.push(day);
  }

  return (
    <div
      className="h-12 border-b border-border bg-background/95 backdrop-blur"
      style={{ width }}
    >
      <div className="relative h-full w-full">
        {scale === "days" && Array.from({ length: Math.max(0, visibleEndDay - visibleStartDay + 1) }).map((_, index) => {
          const day = visibleStartDay + index;
          const date = dayToDate(day);
          return (
            <div
              key={`day-${day}`}
              className="absolute top-0 h-full border-r border-border/60 px-1 pt-1"
              style={{
                left: (day - timelineStartDay) * pxPerDay,
                width: pxPerDay,
              }}
            >
              {pxPerDay >= 24 && (
                <span className="text-[10px] text-muted-foreground">{dayLabel.format(date)}</span>
              )}
            </div>
          );
        })}

        {scale === "weeks" && (() => {
          const blocks: ReactNode[] = [];
          for (const tick of buildMonthTicks(visibleStartDay, visibleEndDay)) {
            const monthStart = tick.monthStartDay;
            blocks.push(
              <div
                key={`week-month-${monthStart}`}
                className="absolute top-0 h-1/2 overflow-hidden whitespace-nowrap border-b border-border/60 px-2 pt-0.5"
                style={{
                  left: (monthStart - timelineStartDay) * pxPerDay,
                  width: tick.dayCount * pxPerDay,
                }}
              >
                <span className="text-[10px] font-medium text-foreground">{monthTitle(dayToDate(monthStart))}</span>
              </div>,
            );
          }
          for (const tick of buildWeekTicks(visibleStartDay, visibleEndDay)) {
            const weekStart = tick.weekStartDay;
            blocks.push(
              <div
                key={`week-${weekStart}`}
                className="absolute bottom-0 h-1/2 overflow-hidden whitespace-nowrap border-r border-border/60 px-0.5 pt-0.5"
                style={{
                  left: (weekStart - timelineStartDay) * pxPerDay,
                  width: 7 * pxPerDay,
                }}
                title={weekLabel(weekStart)}
              >
                <span className="text-[10px] tracking-tight text-muted-foreground">{weekLabel(weekStart)}</span>
              </div>,
            );
          }
          return blocks;
        })()}

        {scale === "months" && (() => {
          const blocks: ReactNode[] = [];
          const monthTicks = buildMonthTicks(visibleStartDay, visibleEndDay);
          for (const tick of monthTicks) {
            const monthStart = tick.monthStartDay;
            const date = dayToDate(monthStart);
            blocks.push(
              <div
                key={`month-${monthStart}`}
                className="absolute top-0 h-full border-r border-border/60 px-2 pt-1"
                style={{
                  left: (monthStart - timelineStartDay) * pxPerDay,
                  width: tick.dayCount * pxPerDay,
                }}
              >
                <span className="text-[10px] text-muted-foreground">{monthLabel.format(date)}</span>
              </div>,
            );
          }
          return blocks;
        })()}

        {monthSeparators.map((day) => (
          <div
            key={`month-sep-${day}`}
            className="absolute top-0 h-full w-px bg-border"
            style={{ left: (day - timelineStartDay) * pxPerDay }}
          />
        ))}
      </div>
    </div>
  );
}
