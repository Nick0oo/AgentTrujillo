import type { CalendarDate, CalendarInterval } from "./types.ts";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcDate(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function isCalendarDate(value: string): value is CalendarDate {
  return toUtcDate(value) !== null;
}

export function parseCalendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) throw new Error("INVALID_CALENDAR_DATE");
  return value;
}

export function compareCalendarDates(left: CalendarDate | string, right: CalendarDate | string): -1 | 0 | 1 {
  parseCalendarDate(left);
  parseCalendarDate(right);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function differenceInCalendarDays(later: CalendarDate | string, earlier: CalendarDate | string): number {
  const laterDate = toUtcDate(parseCalendarDate(later));
  const earlierDate = toUtcDate(parseCalendarDate(earlier));
  return Math.round((laterDate!.getTime() - earlierDate!.getTime()) / 86_400_000);
}

function formatUtcDate(date: Date): CalendarDate {
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}` as CalendarDate;
}

export function addCalendarInterval(date: CalendarDate | string, interval: CalendarInterval): CalendarDate {
  const parsed = toUtcDate(parseCalendarDate(date));
  if (!Number.isInteger(interval.value) || interval.value < 0) throw new Error("INVALID_CALENDAR_INTERVAL");
  if (interval.unit === "days") {
    parsed!.setUTCDate(parsed!.getUTCDate() + interval.value);
    return formatUtcDate(parsed!);
  }
  if (interval.unit === "calendar_months") {
    const originalDay = parsed!.getUTCDate();
    parsed!.setUTCDate(1);
    parsed!.setUTCMonth(parsed!.getUTCMonth() + interval.value);
    const lastDay = new Date(Date.UTC(parsed!.getUTCFullYear(), parsed!.getUTCMonth() + 1, 0)).getUTCDate();
    parsed!.setUTCDate(Math.min(originalDay, lastDay));
    return formatUtcDate(parsed!);
  }
  const originalMonth = parsed!.getUTCMonth();
  const originalDay = parsed!.getUTCDate();
  parsed!.setUTCDate(1);
  parsed!.setUTCFullYear(parsed!.getUTCFullYear() + interval.value);
  parsed!.setUTCMonth(originalMonth);
  const lastDay = new Date(Date.UTC(parsed!.getUTCFullYear(), originalMonth + 1, 0)).getUTCDate();
  parsed!.setUTCDate(Math.min(originalDay, lastDay));
  return formatUtcDate(parsed!);
}
