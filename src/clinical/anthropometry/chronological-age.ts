import type { ChronologicalAge, ChronologicalAgeInput } from "./age-policy.ts";
import { CHRONOLOGICAL_AGE_ALGORITHM_VERSION } from "./age-policy.ts";

type CalendarDate = Readonly<{ year: number; month: number; day: number }>;

export type AgeCalculationErrorCode =
  | "INVALID_BIRTH_DATE"
  | "INVALID_REFERENCE_INSTANT"
  | "INVALID_TIMEZONE"
  | "BIRTH_AFTER_REFERENCE"
  | "MISSING_BIRTH_INSTANT";

export class AgeCalculationError extends Error {
  readonly code: AgeCalculationErrorCode;

  constructor(code: AgeCalculationErrorCode) {
    super(code);
    this.name = "AgeCalculationError";
    this.code = code;
  }
}

function assertTimezone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new AgeCalculationError("INVALID_TIMEZONE");
  }
}

function parseDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new AgeCalculationError("INVALID_BIRTH_DATE");
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCFullYear() !== date.year || check.getUTCMonth() !== date.month - 1 || check.getUTCDate() !== date.day) {
    throw new AgeCalculationError("INVALID_BIRTH_DATE");
  }
  return date;
}

function parseInstant(value: string): Date {
  const instant = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(instant.getTime())) {
    throw new AgeCalculationError("INVALID_REFERENCE_INSTANT");
  }
  return instant;
}

function localDateFromInstant(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function ordinal(date: CalendarDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86_400_000);
}

function compare(left: CalendarDate, right: CalendarDate): number {
  return ordinal(left) - ordinal(right);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(date: CalendarDate, months: number): CalendarDate {
  const absolute = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(absolute / 12);
  const month = absolute % 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function completedMonths(birth: CalendarDate, reference: CalendarDate): number {
  let months = (reference.year - birth.year) * 12 + reference.month - birth.month;
  if (compare(addMonths(birth, months), reference) > 0) months -= 1;
  while (compare(addMonths(birth, months + 1), reference) <= 0) months += 1;
  return Math.max(0, months);
}

export const AgeEngine = Object.freeze({
  calculateChronologicalAge(input: ChronologicalAgeInput): ChronologicalAge {
    assertTimezone(input.timeZone);
    const referenceInstant = parseInstant(input.referenceInstant);
    const birthLocalDate = input.birthDatePrecision === "instant"
      ? localDateFromInstant(parseInstant(input.birthInstant ?? (() => { throw new AgeCalculationError("MISSING_BIRTH_INSTANT"); })()), input.timeZone)
      : input.birthDate;
    const birth = parseDate(birthLocalDate);
    const referenceLocalDate = localDateFromInstant(referenceInstant, input.timeZone);
    const reference = parseDate(referenceLocalDate);
    const ageDays = compare(reference, birth);
    if (ageDays < 0) throw new AgeCalculationError("BIRTH_AFTER_REFERENCE");
    const months = completedMonths(birth, reference);
    return Object.freeze({
      ageDays,
      completedWeeks: Math.floor(ageDays / 7),
      completedMonths: months,
      completedYears: Math.floor(months / 12),
      birthLocalDate,
      referenceLocalDate,
      referenceInstant: input.referenceInstant,
      timeZone: input.timeZone,
      datasetAgeDays: ageDays,
      algorithmVersion: CHRONOLOGICAL_AGE_ALGORITHM_VERSION,
    });
  },
});

export type { ChronologicalAge, ChronologicalAgeInput } from "./age-policy.ts";
