import { describe, expect, it } from "vitest";

import { deriveClinicalReferenceDate, ReferenceDateError } from "../../../src/clinical/governance/effective-date";
import { selectJurisdiction, JurisdictionError } from "../../../src/clinical/governance/jurisdiction";
import { resolvePackageForContext } from "../../../src/clinical/governance/selection-policy";

const country = { countryCode: "CO" as const, source: "authorized-scope" as const, contextVersion: "v1" };

describe("jurisdictional clinical package selection", () => {
  it("uses trusted country and explicit timezone date, including midnight boundaries", () => {
    expect(deriveClinicalReferenceDate({ instant: "2026-01-01T04:59:59.000Z", timeZone: "America/Bogota" })).toBe("2025-12-31");
    expect(deriveClinicalReferenceDate({ instant: "2026-01-01T05:00:00.000Z", timeZone: "America/Bogota" })).toBe("2026-01-01");
    expect(resolvePackageForContext({ context: { countryOfCare: country, contextVersion: "v1", timeZone: "America/Bogota", serverInstant: "2026-01-01T05:00:00.000Z" }, domain: "immunization", locale: "es-CO", artifactSchemaVersion: "1", policy: { domain: "immunization", globalAllowed: false } })).toMatchObject({ countryCode: "CO", referenceDate: "2026-01-01" });
  });

  it("rejects model/request country overrides and allows GLOBAL only by named policy", () => {
    expect(() => selectJurisdiction(country, { domain: "immunization", globalAllowed: false }, "US")).toThrowError(expect.objectContaining({ code: "JURISDICTION_MISMATCH" }));
    expect(selectJurisdiction(country, { domain: "growth", globalAllowed: true }, "GLOBAL")).toBe("GLOBAL");
  });

  it("keeps historical dates explicit and rejects invalid/DST/timezone inputs", () => {
    expect(deriveClinicalReferenceDate({ instant: new Date(), timeZone: "America/New_York", historicalDate: "2024-02-29" })).toBe("2024-02-29");
    expect(() => deriveClinicalReferenceDate({ instant: new Date(), timeZone: "Mars/Olympus", historicalDate: "2024-02-30" })).toThrowError(ReferenceDateError);
    expect(() => deriveClinicalReferenceDate({ instant: new Date("invalid"), timeZone: "UTC" })).toThrowError(ReferenceDateError);
  });

  it("rejects stale context version before resolver selection", () => {
    expect(() => resolvePackageForContext({ context: { countryOfCare: country, contextVersion: "v2", timeZone: "UTC", serverInstant: new Date() }, domain: "growth", locale: "es-CO", artifactSchemaVersion: "1", policy: { domain: "growth", globalAllowed: false } })).toThrowError("JURISDICTION_MISMATCH");
    expect(() => selectJurisdiction({ ...country, countryCode: "CO" }, { domain: "growth", globalAllowed: false }, "GLOBAL")).toThrowError(JurisdictionError);
  });
});
