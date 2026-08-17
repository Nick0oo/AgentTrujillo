import { describe, expect, it } from "vitest";

import { vaccineAdministrationCommandSchema } from "../../../src/clinical/immunization/schemas.ts";
import {
  addCalendarInterval,
  compareCalendarDates,
  differenceInCalendarDays,
  isCalendarDate,
} from "../../../src/clinical/immunization/calendar.ts";

describe("immunization domain contracts", () => {
  it("accepts an untrusted administration declaration only", () => {
    const command = vaccineAdministrationCommandSchema.parse({
      administeredOn: "2026-08-16",
      product: { productCode: "SYNTH-HEP-B", alias: "synthetic hep b" },
      antigenCodes: ["HEP_B"],
      doseLabel: "dose-1",
      provenanceType: "guardian",
    });

    expect(command.administeredOn).toBe("2026-08-16");
    expect(command).not.toHaveProperty("childId");
    expect(command).not.toHaveProperty("confirmationStatus");
  });

  it("rejects authority, derived, and unknown fields", () => {
    expect(() => vaccineAdministrationCommandSchema.parse({
      administeredOn: "2026-08-16",
      product: { productCode: "SYNTH-HEP-B" },
      childId: "00000000-0000-4000-8000-000000000001",
      status: "applied",
    })).toThrow();
  });

  it("uses calendar arithmetic rather than timezone-sensitive timestamps", () => {
    expect(isCalendarDate("2024-02-29")).toBe(true);
    expect(isCalendarDate("2025-02-29")).toBe(false);
    expect(addCalendarInterval("2024-01-31", { unit: "calendar_months", value: 1 })).toBe("2024-02-29");
    expect(addCalendarInterval("2024-02-29", { unit: "calendar_years", value: 1 })).toBe("2025-02-28");
    expect(differenceInCalendarDays("2026-08-20", "2026-08-16")).toBe(4);
    expect(compareCalendarDates("2026-08-16", "2026-08-16")).toBe(0);
    expect(compareCalendarDates("2026-08-15", "2026-08-16")).toBe(-1);
  });
});
