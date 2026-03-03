import type { ReactNode } from "react";
import { fromDayIndex } from "@/lib/estimate-v2/schedule";

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

const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });

function dayToDate(dayIndex: number): Date {
  return new Date(fromDayIndex(dayIndex));
}

function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

function startOfIsoWeek(dayIndex: number): number {
  const date = dayToDate(dayIndex);
  const mondayOffset = (date.getDay() + 6) % 7;
  return dayIndex - mondayOffset;
}

function startOfMonth(dayIndex: number): number {
  const date = dayToDate(dayIndex);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return Math.trunc(new Date(Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())).getTime() / 86400000);
}

function monthDayCount(dayIndex: number): number {
  const date = dayToDate(dayIndex);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
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
  const monthSeparators: number[] = [];
  for (let day = Math.max(timelineStartDay, visibleStartDay - 2); day <= Math.min(timelineEndDay, visibleEndDay + 2); day += 1) {
    const date = dayToDate(day);
    if (date.getDate() === 1) monthSeparators.push(day);
  }

  return (
    <div
      className="sticky top-0 z-20 h-12 border-b border-border bg-background/95 backdrop-blur"
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
          const firstWeek = startOfIsoWeek(visibleStartDay);
          for (let weekStart = firstWeek; weekStart <= visibleEndDay; weekStart += 7) {
            const date = dayToDate(weekStart);
            blocks.push(
              <div
                key={`week-${weekStart}`}
                className="absolute top-0 h-full border-r border-border/60 px-2 pt-1"
                style={{
                  left: (weekStart - timelineStartDay) * pxPerDay,
                  width: 7 * pxPerDay,
                }}
              >
                <span className="text-[10px] text-muted-foreground">W{isoWeek(date)}</span>
              </div>,
            );
          }
          return blocks;
        })()}

        {scale === "months" && (() => {
          const blocks: ReactNode[] = [];
          let monthStart = startOfMonth(visibleStartDay);
          while (monthStart <= visibleEndDay) {
            const date = dayToDate(monthStart);
            const days = monthDayCount(monthStart);
            blocks.push(
              <div
                key={`month-${monthStart}`}
                className="absolute top-0 h-full border-r border-border/60 px-2 pt-1"
                style={{
                  left: (monthStart - timelineStartDay) * pxPerDay,
                  width: days * pxPerDay,
                }}
              >
                <span className="text-[10px] text-muted-foreground">{monthLabel.format(date)}</span>
              </div>,
            );
            monthStart += days;
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
