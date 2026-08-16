export type ClinicalReferenceDate = string & { readonly __clinicalReferenceDate: unique symbol };
export type ReferenceDateErrorCode = "REFERENCE_DATE_INVALID" | "TIMEZONE_INVALID";
export class ReferenceDateError extends Error {
  readonly code: ReferenceDateErrorCode;
  constructor(code: ReferenceDateErrorCode) { super(code); this.name = "ReferenceDateError"; this.code = code; }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function deriveClinicalReferenceDate(input: Readonly<{ instant: Date | string; timeZone: string; historicalDate?: string }>): ClinicalReferenceDate {
  if (input.historicalDate !== undefined) {
    if (!validDate(input.historicalDate)) throw new ReferenceDateError("REFERENCE_DATE_INVALID");
    return input.historicalDate as ClinicalReferenceDate;
  }
  const instant = input.instant instanceof Date ? input.instant : new Date(input.instant);
  if (!Number.isFinite(instant.getTime())) throw new ReferenceDateError("REFERENCE_DATE_INVALID");
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: input.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    if (!validDate(date)) throw new ReferenceDateError("REFERENCE_DATE_INVALID");
    return date as ClinicalReferenceDate;
  } catch (error) {
    if (error instanceof ReferenceDateError) throw error;
    throw new ReferenceDateError("TIMEZONE_INVALID");
  }
}
