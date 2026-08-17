import { describe, expect, it, vi } from "vitest";

import { reevaluateCountry, reevaluateForCountryChange } from "../../../src/clinical/immunization/reevaluation.ts";
import type { ImmunizationRule } from "../../../src/clinical/immunization/types.ts";

const rule: ImmunizationRule = {
  id: "rule-1" as never,
  code: "CO-HEP-B-1",
  countryCode: "CO",
  kind: "routine",
  seriesCode: "HEP_B",
  doseCode: "D1",
  doseNumber: 1,
  antigenId: "hep-b" as never,
  minimumAge: null,
  targetAge: null,
  targetAgeUntil: null,
  minimumInterval: null,
  recommendedInterval: null,
  catchUp: true,
  eligibilityCriteria: {},
  contraindicationReviewRequired: false,
  sourceReferences: ["synthetic"],
};

describe("country-change reevaluation", () => {
  it("recomputes append-only assessments deterministically without mixing packs", () => {
    const input = {
      childId: "child-1",
      careSpaceId: "space-1",
      fromCountry: "US" as const,
      toCountry: "CO" as const,
      asOfDate: "2026-08-16" as never,
      rulePack: { packageId: "co-pai", version: "2026.1", countryCode: "CO" as const, activation: "active" as const, sourceDigest: "a".repeat(64) as never },
      rules: [rule],
      confirmedAdministrations: [{ id: "admin-1" as never, administeredOn: "2026-08-01" as never, countryCode: "CO" as const, antigenIds: ["hep-b" as never] }],
      algorithmId: "immunization-status-v1",
      assessedAt: "2026-08-16T12:00:00.000Z",
    };
    const first = reevaluateCountry(input);
    const second = reevaluateCountry(input);
    expect(first).toEqual(second);
    expect(first.assessments[0].status).toBe("applied");
    expect(first.assessments[0].decisionDigest).toHaveLength(64);
    expect(first.assessments[0]).not.toHaveProperty("updatedAt");
  });

  it("requires review when a foreign fact would otherwise cross jurisdiction", () => {
    const result = reevaluateCountry({
      childId: "child-1", careSpaceId: "space-1", fromCountry: "CO", toCountry: "US", asOfDate: "2026-08-16" as never,
      rulePack: { packageId: "us-acip", version: "2026.1", countryCode: "US" as const, activation: "active" as const, sourceDigest: "b".repeat(64) as never },
      rules: [{ ...rule, countryCode: "US", code: "US-HEP-B-1" }],
      confirmedAdministrations: [{ id: "admin-1" as never, administeredOn: "2026-08-01" as never, countryCode: "CO" as const, antigenIds: ["hep-b" as never] }],
      algorithmId: "immunization-status-v1", assessedAt: "2026-08-16T12:00:00.000Z",
    });
    expect(result.assessments[0].status).toBe("review_required");
  });

  it("orchestrates a trusted country event through the repository and converges replay", async () => {
    const saveCountryChangeRun = vi.fn().mockResolvedValue({ outcome: "created", runId: "run-1", assessmentIds: ["assessment-1"] });
    const deps = {
      loadConfirmedAdministrations: vi.fn().mockResolvedValue([{ id: "admin-1" as never, administeredOn: "2026-08-01" as never, countryCode: "CO" as const, antigenIds: ["hep-b" as never] }]),
      resolveTargetPackage: vi.fn().mockResolvedValue({ packageId: "us-acip", version: "2026.1", countryCode: "US" as const, activation: "active" as const, sourceDigest: "d".repeat(64), scheduleId: "schedule-1", databaseRulePackId: "00000000-0000-4000-8000-000000000020", databaseAlgorithmId: "00000000-0000-4000-8000-000000000021", rules: [{ ...rule, countryCode: "US", code: "US-HEP-B-1" }] }),
      saveCountryChangeRun,
    };
    const scope = { careSpaceId: "space-1", childId: "child-1", countryOfCare: "CO" as const } as unknown as import("../../../src/clinical/immunization/reevaluation.ts").CountryChangeScope;
    const input = { eventId: "country-event-1", effectiveAt: "2026-08-16" as never, expectedPriorCountry: "CO" as const, newCountry: "US" as const, targetCutoff: "2026-08-16" as never, idempotencyKey: "country-replay-1", priorAssessmentRunId: "prior-run-1" };

    const first = await reevaluateForCountryChange(deps, scope, input);
    expect(first.outcome).toBe("created");
    if (first.outcome === "rejected") throw new Error(first.reasonCode);
    expect(first.newAssessmentRunId).toBeTruthy();
    expect(first.dispositions[0].disposition).toBe("review_required");
    expect(saveCountryChangeRun).toHaveBeenCalledWith(scope, expect.objectContaining({ eventId: "country-event-1", reevaluatesRunId: "prior-run-1" }));

    saveCountryChangeRun.mockResolvedValueOnce({ outcome: "idempotent_replay", runId: first.newAssessmentRunId, assessmentIds: ["assessment-1"] });
    const replay = await reevaluateForCountryChange(deps, scope, input);
    expect(replay.outcome).toBe("idempotent_replay");
    if (replay.outcome === "rejected") throw new Error(replay.reasonCode);
    expect(replay.newAssessmentRunId).toBe(first.newAssessmentRunId);
  });
});
