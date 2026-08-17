import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acipUsPackSchema } from "../../../src/clinical/immunization/packs/acip-us-schema.ts";

describe("US ACIP pack boundary", () => {
  it("requires every official component and keeps the fixture non-actionable", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/acip-us-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("US");
    expect(fixture.containsActionableSchedule).toBe(false);
    expect(fixture.requiredComponents).toEqual(expect.arrayContaining(["by_age", "catch_up", "medical_indication", "notes", "appendix", "addendum", "official_status"]));
  });

  it("rejects a malformed package before compilation", () => {
    expect(() => acipUsPackSchema.parse({ packageId: "us", version: "2026.1", effectiveFrom: "2026-01-01", effectiveUntil: null, status: "candidate", approvalState: "blocked", sourceReferences: [], sourceDigest: "bad", rules: [], dependencies: [] })).toThrow();
  });
});
