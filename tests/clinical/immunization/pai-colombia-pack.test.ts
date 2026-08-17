import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { paiColombiaPackSchema } from "../../../src/clinical/immunization/packs/pai-colombia-schema.ts";

describe("Colombia PAI pack boundary", () => {
  it("keeps the structural fixture non-actionable and blocked", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../fixtures/immunization/pai-colombia-structural.json", import.meta.url), "utf8"));
    expect(fixture.countryCode).toBe("CO");
    expect(fixture.containsActionableSchedule).toBe(false);
    expect(fixture.activation).toBe("blocked_pending_external_clinical_approval");
    expect(fixture.requiredRuleKinds).toEqual(expect.arrayContaining(["routine", "catch_up", "campaign", "review_only"]));
  });

  it("rejects a malformed package before compilation", () => {
    expect(() => paiColombiaPackSchema.parse({ packageId: "co", version: "2026.1", effectiveFrom: "2026-01-01", effectiveUntil: null, status: "candidate", approvalState: "blocked", sourceReferences: [], sourceDigest: "bad", rules: [], dependencies: [] })).toThrow();
  });
});
