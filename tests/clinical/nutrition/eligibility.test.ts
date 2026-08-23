import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import type {
  FoodReactionEvidence,
  FoodReactionQuerySuccess,
} from "../../../src/application/nutrition/food-reaction-query.ts";
import type {
  NutritionProfileProjection,
  NutritionProfileQuerySuccess,
} from "../../../src/application/nutrition/nutrition-profile-query.ts";
import type { NutritionAgeEvidence } from "../../../src/clinical/nutrition/types.ts";
import {
  evaluateNutritionEligibility,
  type NutritionEligibilityContext,
  type NutritionEligibilityGovernance,
  type NutritionEligibilityPolicy,
} from "../../../src/clinical/nutrition/eligibility.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";

const DIGEST = "a".repeat(64) as Sha256Hex;
const PACKAGE_APPROVAL_DIGEST = "b".repeat(64) as Sha256Hex;
const RIGHTS_DIGEST = "c".repeat(64) as Sha256Hex;
const ARTIFACT_DIGEST = "d".repeat(64) as Sha256Hex;
const APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
const CUTOFF = "2026-08-22T12:00:00.000Z";

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

const factProvenance = {
  provenanceType: "system" as const,
  sourceId: "synthetic-fact",
  sourceDigest: DIGEST,
  observedAt: CUTOFF,
};

const age = {
  ageDays: 180,
  basis: "chronological" as const,
  referenceInstant: CUTOFF,
  timeZone: "America/Bogota",
  algorithmVersion: "chronological-age.v1",
  provenance: factProvenance,
};

const profileProjection = {
  feedingApproach: "traditional_complementary" as const,
  textureStage: "soft_lumpy" as const,
  exclusions: [] as readonly string[],
  source: {
    sourceId: "synthetic-profile",
    createdAt: "2026-08-22T11:00:00.000Z",
    updatedAt: "2026-08-22T11:00:00.000Z",
  },
};

function profileEnvelope(
  profile: NutritionProfileProjection = profileProjection,
  profileAge: NutritionAgeEvidence = age,
): NutritionProfileQuerySuccess {
  const completeness = {
    age: "complete" as const,
    feedingApproach: profile.feedingApproach === null ? "missing" as const : "complete" as const,
    textureStage: profile.textureStage === null ? "missing" as const : "complete" as const,
    exclusions: "complete" as const,
    professionalPlan: "unknown" as const,
  };
  return {
    ok: true,
    status: "available",
    age: profileAge,
    profile,
    professionalPlan: "unknown",
    completeness,
    digest: digest({
      algorithmVersion: "nutrition-profile-query.v1",
      cutoff: profileAge.referenceInstant,
      age: profileAge,
      profile,
      professionalPlan: "unknown",
      completeness,
    }),
  };
}

function reactionEnvelope(reactions: readonly FoodReactionEvidence[] = [], cutoff = CUTOFF): FoodReactionQuerySuccess {
  const ordered = [...reactions].sort((left, right) => canonicalize(left).localeCompare(canonicalize(right)));
  return {
    ok: true,
    status: "available",
    reactions: ordered,
    digest: digest({ algorithmVersion: "food-reaction-query.v1", cutoff, reactions: ordered }),
  };
}

const profile = profileEnvelope();
const context: NutritionEligibilityContext = {
  countryOfCare: "CO",
  cutoff: CUTOFF,
  age,
  readiness: { status: "ready", provenance: factProvenance },
  feedingApproach: "traditional_complementary",
  textureStage: "soft_lumpy",
  restrictions: [],
  professionalPlan: "unknown",
  profile,
  reactions: reactionEnvelope(),
  concerns: {
    swallowing: "none",
    poorGrowthOrCondition: "none",
    specialDiet: "none",
  },
};

const contentProvenance = {
  packageId: "nutrition-co-synthetic",
  packageVersion: "1.0.0",
  algorithmVersion: "nutrition-eligibility.v1",
  fixturesSha256: DIGEST,
  rightsSha256: RIGHTS_DIGEST,
  jurisdiction: "CO" as const,
  locale: "es-CO",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  translation: "original" as const,
  artifactSha256: ARTIFACT_DIGEST,
  approvalDigest: PACKAGE_APPROVAL_DIGEST,
  sources: [{
    sourceId: "synthetic-source",
    sourceUri: "https://example.invalid/nutrition",
    sourceVersion: "2026",
    artifactSha256: DIGEST,
    license: "synthetic-test-license",
    retrievedAt: CUTOFF,
  }],
};

const governance: NutritionEligibilityGovernance = {
  packageId: contentProvenance.packageId,
  packageVersion: contentProvenance.packageVersion,
  country: "CO",
  sourceDigests: [DIGEST],
  artifactSha256: contentProvenance.artifactSha256,
  algorithmId: "nutrition-eligibility",
  algorithmVersion: contentProvenance.algorithmVersion,
  fixturesSha256: contentProvenance.fixturesSha256,
  rightsSha256: contentProvenance.rightsSha256,
  approvalDigest: contentProvenance.approvalDigest,
  approvalRecordDigest: APPROVAL_RECORD_DIGEST,
  approvalProvenance: "product_owner_conveyed",
  releaseStatus: "active",
};

const policy: NutritionEligibilityPolicy = {
  country: "CO",
  contentId: "recipe-soft-lentil-plantain",
  contentType: "recipe",
  tags: ["iron", "complementary-feeding"],
  ingredientCodes: ["lentil", "plantain"],
  minAgeDays: 180,
  maxAgeDays: 365,
  readiness: "required",
  texture: "soft_lumpy",
  supervision: "required",
  provenance: contentProvenance,
  governance,
};

function reaction(overrides: Partial<FoodReactionEvidence> = {}): FoodReactionEvidence {
  return {
    identity: {
      id: "reaction-1",
      foodLabel: "peanut",
      foodCode: "peanut",
      mapping: "normalized",
    },
    declaration: {
      reactionType: "allergy",
      severity: "unknown",
      status: "confirmed",
      lifecycle: "active",
    },
    confirmation: { status: "confirmed" },
    supersession: "unknown",
    uncertainty: ["supersession_unavailable"],
    provenance: {
      provenanceType: "guardian",
      observedOn: "2026-08-20",
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
    ...overrides,
  };
}

describe("nutrition eligibility", () => {
  it("keeps inclusive age boundaries while reviewing missing professional-plan evidence", () => {
    const lower = evaluateNutritionEligibility(context, policy);
    const upperAge = { ...age, ageDays: 365 };
    const upper = evaluateNutritionEligibility({
      ...context,
      age: upperAge,
      profile: profileEnvelope(profileProjection, upperAge),
    }, policy);

    expect(lower.status).toBe("review_required");
    expect(upper.status).toBe("review_required");
    expect(lower.matchedTags).toEqual(["complementary-feeding", "iron"]);
    expect(lower.reasonCodes).toContain("professional_plan_unknown");
    expect(lower.reasonCodes).not.toContain("age_out_of_range");
  });

  it("keeps Colombia and United States policy evidence separate", () => {
    const result = evaluateNutritionEligibility(context, {
      ...policy,
      country: "US",
      provenance: { ...contentProvenance, jurisdiction: "US", locale: "en-US" },
      governance: { ...governance, country: "US" },
    });

    expect(result.status).toBe("excluded");
    expect(result.reasonCodes).toContain("country_mismatch");
  });

  it("uses deny precedence when profile and active reaction exclusions overlap", () => {
    const result = evaluateNutritionEligibility({
      ...context,
      profile: profileEnvelope({ ...profileProjection, exclusions: ["lentil"] }),
      reactions: reactionEnvelope([reaction({
        identity: { ...reaction().identity, foodCode: "plantain", foodLabel: "plantain" },
      })]),
    }, policy);

    expect(result.status).toBe("excluded");
    expect(result.reasonCodes).toEqual(["known_reaction", "professional_plan_unknown", "profile_exclusion"]);
  });

  it("does not turn resolved or entered-in-error reactions into active exclusions", () => {
    for (const lifecycle of ["resolved", "entered_in_error"] as const) {
      const result = evaluateNutritionEligibility({
        ...context,
        reactions: reactionEnvelope([reaction({
          declaration: { ...reaction().declaration, lifecycle, status: lifecycle },
          confirmation: { status: "unknown" },
          uncertainty: ["supersession_unavailable", "confirmation_uncertain"],
        })]),
      }, policy);

      expect(result.status, lifecycle).toBe("review_required");
      expect(result.reasonCodes).not.toContain("known_reaction");
    }
  });

  it("reviews unmapped or conflicting active reactions and rejects unknown ingredients", () => {
    const unmapped = evaluateNutritionEligibility({
      ...context,
      reactions: reactionEnvelope([reaction({
        identity: { ...reaction().identity, foodCode: null, mapping: "unmapped" },
        uncertainty: ["supersession_unavailable", "unmapped_food"],
      })]),
    }, policy);
    const conflicting = evaluateNutritionEligibility({
      ...context,
      reactions: reactionEnvelope([reaction({
        identity: { ...reaction().identity, foodCode: "rice", foodLabel: "rice" },
        uncertainty: ["supersession_unavailable", "conflicting_evidence"],
      })]),
    }, policy);
    const unknownIngredient = evaluateNutritionEligibility(context, {
      ...policy,
      ingredientCodes: ["unknown"],
    });

    expect(unmapped.status).toBe("review_required");
    expect(unmapped.reasonCodes).toContain("unmapped_reaction");
    expect(conflicting.status).toBe("review_required");
    expect(conflicting.reasonCodes).toContain("conflicting_reaction");
    expect(unknownIngredient.status).toBe("excluded");
    expect(unknownIngredient.reasonCodes).toContain("unknown_ingredient");
  });

  it("reviews missing or unsafe readiness, texture, swallowing, diet, and growth context", () => {
    const result = evaluateNutritionEligibility({
      ...context,
      readiness: { ...context.readiness, status: "unknown" },
      textureStage: "unknown",
      concerns: { swallowing: "active", poorGrowthOrCondition: "active", specialDiet: "active" },
      professionalPlan: "unknown",
      profile: profileEnvelope({ ...profileProjection, textureStage: "unknown" }),
    }, policy);

    expect(result.status).toBe("review_required");
    expect(result.reasonCodes).toEqual([
      "poor_growth_or_condition",
      "professional_plan_unknown",
      "readiness_unknown",
      "special_diet",
      "swallowing_concern",
      "texture_unknown",
    ]);
  });

  it("fails closed on governance, approval, algorithm, and duplicate drift", () => {
    const rightsDrift = evaluateNutritionEligibility(context, {
      ...policy,
      governance: { ...governance, rightsSha256: "e".repeat(64) as Sha256Hex },
    });
    const approvalDrift = evaluateNutritionEligibility(context, {
      ...policy,
      governance: { ...governance, approvalRecordDigest: RIGHTS_DIGEST },
    });
    const packageApprovalDrift = evaluateNutritionEligibility(context, {
      ...policy,
      governance: { ...governance, approvalDigest: RIGHTS_DIGEST },
    });
    const duplicateTags = evaluateNutritionEligibility(context, { ...policy, tags: ["iron", "iron"] });
    const duplicateSources = evaluateNutritionEligibility(context, {
      ...policy,
      provenance: { ...contentProvenance, sources: [contentProvenance.sources[0], contentProvenance.sources[0]] },
    });
    const missingGovernance = evaluateNutritionEligibility(context, { ...policy, governance: undefined as never });

    expect(rightsDrift.status).toBe("excluded");
    expect(rightsDrift.reasonCodes).toContain("rights_drift");
    expect(approvalDrift.reasonCodes).toContain("approval_drift");
    expect(packageApprovalDrift.reasonCodes).toContain("approval_drift");
    expect(duplicateTags.reasonCodes).toEqual(["policy_invalid"]);
    expect(duplicateSources.reasonCodes).toEqual(["policy_invalid"]);
    expect(missingGovernance.reasonCodes).toContain("governance_missing");
  });

  it("requires system chronological age, rejects LLM or impossible age, and uses local effective dates", () => {
    const untrustedAge = evaluateNutritionEligibility({
      ...context,
      age: { ...age, provenance: { ...age.provenance, provenanceType: "guardian" } },
      profile: profileEnvelope(profileProjection, { ...age, provenance: { ...age.provenance, provenanceType: "guardian" } }),
    }, policy);
    const llmAge = evaluateNutritionEligibility({
      ...context,
      age: { ...age, algorithmVersion: "llm-age.v1" },
      profile: profileEnvelope(profileProjection, { ...age, algorithmVersion: "llm-age.v1" }),
    }, policy);
    const correctedAge = evaluateNutritionEligibility({
      ...context,
      age: { ...age, basis: "corrected" },
      profile: profileEnvelope(profileProjection, { ...age, basis: "corrected" }),
    }, policy);
    const impossibleAge = evaluateNutritionEligibility({
      ...context,
      age: { ...age, ageDays: 18 * 366 + 1 },
      profile: profileEnvelope(profileProjection, { ...age, ageDays: 18 * 366 + 1 }),
    }, policy);
    const localMidnightAge = {
      ...age,
      referenceInstant: "2026-01-02T00:30:00.000Z",
      provenance: { ...age.provenance, observedAt: "2026-01-02T00:30:00.000Z" },
    };
    const localMidnight = evaluateNutritionEligibility({
      ...context,
      cutoff: localMidnightAge.referenceInstant,
      age: localMidnightAge,
      profile: profileEnvelope(profileProjection, localMidnightAge),
      reactions: reactionEnvelope([], localMidnightAge.referenceInstant),
    }, {
      ...policy,
      provenance: { ...contentProvenance, effectiveFrom: "2026-01-01", effectiveUntil: "2026-01-01" },
    });

    expect(untrustedAge.reasonCodes).toContain("age_untrusted");
    expect(llmAge.reasonCodes).toContain("age_untrusted");
    expect(correctedAge.reasonCodes).toContain("age_untrusted");
    expect(impossibleAge.reasonCodes).toContain("age_invalid");
    expect(localMidnight.reasonCodes).not.toContain("provenance_drift");
  });

  it("honors readiness requirements without blocking explicitly non-readiness content", () => {
    const notReady = { ...context, readiness: { ...context.readiness, status: "not_ready" as const } };
    const required = evaluateNutritionEligibility(notReady, policy);
    const notRequired = evaluateNutritionEligibility(notReady, { ...policy, readiness: "not_required" });
    const unknownAny = evaluateNutritionEligibility({ ...context, readiness: { ...context.readiness, status: "unknown" as const } }, { ...policy, readiness: "any" });

    expect(required.status).toBe("excluded");
    expect(required.reasonCodes).toContain("readiness_not_ready");
    expect(notRequired.reasonCodes).not.toContain("readiness_not_ready");
    expect(unknownAny.reasonCodes).not.toContain("readiness_unknown");
  });

  it("fails closed on missing, unavailable, and malformed query envelopes with distinct fallback evidence", () => {
    const missingProfile = evaluateNutritionEligibility({ ...context, profile: undefined as never }, policy);
    const unavailableProfile = evaluateNutritionEligibility({
      ...context,
      profile: { ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" } as never,
    }, policy);
    const malformedReactions = evaluateNutritionEligibility({
      ...context,
      reactions: { ok: true, status: "available", reactions: [], digest: DIGEST } as never,
    }, policy);
    const malformedReaction = reaction({
      identity: { ...reaction().identity, foodCode: "lentil", foodLabel: "lentil" },
      declaration: { ...reaction().declaration, lifecycle: "invalid" as never },
    });
    const resignedMalformedReactions = evaluateNutritionEligibility({
      ...context,
      reactions: reactionEnvelope([malformedReaction]),
    }, policy);

    expect(missingProfile.status).toBe("excluded");
    expect(unavailableProfile.status).toBe("excluded");
    expect(malformedReactions.status).toBe("excluded");
    expect(missingProfile.reasonCodes).toEqual(["profile_query_unavailable"]);
    expect(unavailableProfile.reasonCodes).toEqual(["profile_query_unavailable"]);
    expect(malformedReactions.reasonCodes).toEqual(["reaction_query_invalid"]);
    expect(resignedMalformedReactions.reasonCodes).toEqual(["reaction_query_invalid"]);
    expect(missingProfile.provenance.decisionDigest).not.toBe("0".repeat(64));
    expect(missingProfile.provenance.decisionDigest).not.toBe(unavailableProfile.provenance.decisionDigest);
  });

  it("sorts set-like material and emits deterministic canonical evidence", () => {
    const first = evaluateNutritionEligibility(context, policy);
    const second = evaluateNutritionEligibility({
      ...context,
      restrictions: [...context.restrictions].reverse(),
      reactions: reactionEnvelope([...context.reactions.reactions].reverse()),
    }, {
      ...policy,
      tags: [...policy.tags].reverse(),
      ingredientCodes: [...policy.ingredientCodes].reverse(),
      governance: { ...governance, sourceDigests: [...governance.sourceDigests].reverse() },
    });

    expect(second).toEqual(first);
    expect(first.provenance.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.provenance.decisionDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.provenance.decisionDigest).not.toBe(first.provenance.inputDigest);
  });
});
