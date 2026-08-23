import { describe, expect, it } from "vitest";

import {
  approvedGuidanceBlockSchema,
  foodRestrictionSchema,
  nutritionContextSchema,
  nutritionContentProvenanceSchema,
  nutritionEligibilitySchema,
  nutritionGuidanceResultSchema,
  recipeTemplateSchema,
} from "../../../src/clinical/nutrition/types.ts";

const DIGEST = "a".repeat(64);
const OTHER_DIGEST = "b".repeat(64);

const factProvenance = {
  provenanceType: "guardian" as const,
  sourceId: "synthetic-fact",
  sourceDigest: DIGEST,
  observedAt: "2026-08-22T12:00:00.000Z",
};

const contentProvenance = {
  packageId: "nutrition-co-synthetic",
  packageVersion: "1.0.0",
  algorithmVersion: "nutrition-content.v1",
  fixturesSha256: DIGEST,
  rightsSha256: OTHER_DIGEST,
  jurisdiction: "CO" as const,
  locale: "es-CO",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  translation: "original" as const,
  artifactSha256: DIGEST,
  approvalDigest: OTHER_DIGEST,
  sources: [{
    sourceId: "synthetic-source",
    sourceUri: "https://example.invalid/nutrition",
    sourceVersion: "2026",
    artifactSha256: DIGEST,
    license: "synthetic-test-license",
    retrievedAt: "2026-08-22T12:00:00.000Z",
  }],
};

const decisionProvenance = {
  packageId: contentProvenance.packageId,
  packageVersion: contentProvenance.packageVersion,
  artifactSha256: DIGEST,
  sourceDigests: [DIGEST],
  algorithmId: "nutrition-eligibility",
  algorithmVersion: "1.0.0",
  inputDigest: DIGEST,
  decisionDigest: OTHER_DIGEST,
};

const restriction = {
  kind: "allergy" as const,
  foodCode: "peanut",
  foodLabel: "peanut",
  state: "confirmed" as const,
  severity: "unknown" as const,
  supersedesId: null,
  provenance: factProvenance,
};

const restrictionStates = ["declared", "confirmed", "resolved", "entered_in_error", "unknown"] as const;
const restrictionKinds = [
  { kind: "allergy", severity: "unknown" },
  { kind: "intolerance", severity: "unknown" },
  { kind: "reaction", severity: "unknown" },
  { kind: "dislike", severity: null },
  { kind: "preference", severity: null },
  { kind: "unknown", severity: null, reasonCode: "unmapped_food" },
] as const;

const context = {
  age: {
    ageDays: 182,
    basis: "chronological" as const,
    referenceInstant: "2026-08-22T12:00:00.000Z",
    timeZone: "America/Bogota",
    algorithmVersion: "chronological-age.v1",
    provenance: factProvenance,
  },
  readiness: {
    status: "ready" as const,
    provenance: factProvenance,
  },
  feedingApproach: "traditional_complementary" as const,
  textureStage: "soft_lumpy" as const,
  restrictions: [restriction],
  professionalPlan: "none" as const,
};

const block = {
  id: "block-iron-rich-foods",
  kind: "education" as const,
  title: "Iron-rich foods",
  text: "Offer age-appropriate iron-rich foods.",
  tags: ["iron", "complementary-feeding"],
  minAgeDays: 180,
  maxAgeDays: null,
  provenance: contentProvenance,
};

const recipe = {
  id: "recipe-soft-lentil-plantain",
  title: "Soft lentil and plantain idea",
  ingredientCodes: ["lentil", "plantain"],
  guidanceBlockIds: [block.id],
  exclusionCodes: ["peanut"],
  preparationSteps: ["Cook until soft and serve in the approved texture."],
  texture: "soft_lumpy" as const,
  supervision: "required" as const,
  provenance: contentProvenance,
};

describe("nutrition domain contracts", () => {
  it("accepts exact age/readiness/restriction evidence without authority fields", () => {
    const parsed = nutritionContextSchema.parse(context);

    expect(parsed.age.ageDays).toBe(182);
    expect(parsed.restrictions[0]?.kind).toBe("allergy");
    expect(parsed).not.toHaveProperty("childId");
    expect(parsed).not.toHaveProperty("careSpaceId");
    expect(parsed).not.toHaveProperty("countryOfCare");
  });

  it("rejects impossible age boundaries, missing provenance, and unknown authority fields", () => {
    expect(nutritionContextSchema.safeParse({
      ...context,
      age: { ...context.age, ageDays: -1 },
    }).success).toBe(false);
    expect(nutritionContextSchema.safeParse({
      ...context,
      readiness: { status: "ready" },
    }).success).toBe(false);
    expect(nutritionContextSchema.safeParse({
      ...context,
      childId: "child-from-model",
    }).success).toBe(false);
    expect(nutritionContextSchema.safeParse({
      ...context,
      age: { ...context.age, completedMonths: 6 },
    }).success).toBe(false);
  });

  it("keeps restriction kinds closed and does not turn unknown facts into allergies", () => {
    expect(foodRestrictionSchema.safeParse(restriction).success).toBe(true);
    expect(foodRestrictionSchema.safeParse({
      ...restriction,
      kind: "diagnosed_allergy",
    }).success).toBe(false);
    expect(foodRestrictionSchema.safeParse({
      kind: "unknown",
      foodCode: null,
      foodLabel: "unmapped food",
      state: "unknown",
      severity: null,
      supersedesId: null,
      provenance: factProvenance,
    }).success).toBe(false);
    expect(foodRestrictionSchema.safeParse({
      ...restriction,
      approvedBy: "model-claim",
    }).success).toBe(false);
  });

  it("accepts every closed restriction state and kind combination", () => {
    for (const state of restrictionStates) {
      for (const kindShape of restrictionKinds) {
        const parsed = foodRestrictionSchema.safeParse({
          ...restriction,
          ...kindShape,
          foodCode: kindShape.kind === "unknown" ? null : restriction.foodCode,
          state,
        });

        expect(parsed.success, `${kindShape.kind}/${state}`).toBe(true);
      }
    }
  });

  it("requires governed provenance for approved blocks and recipes", () => {
    expect(approvedGuidanceBlockSchema.safeParse(block).success).toBe(true);
    expect(recipeTemplateSchema.safeParse(recipe).success).toBe(true);
    expect(approvedGuidanceBlockSchema.safeParse({
      ...block,
      provenance: { ...contentProvenance, artifactSha256: "not-a-digest" },
    }).success).toBe(false);
    expect(recipeTemplateSchema.safeParse({
      ...recipe,
      countryOfCare: "US",
    }).success).toBe(false);
    expect(approvedGuidanceBlockSchema.safeParse({
      ...block,
      maxAgeDays: 179,
    }).success).toBe(false);
    expect(approvedGuidanceBlockSchema.safeParse({
      ...block,
      provenance: { ...contentProvenance, effectiveFrom: "2026-12-31", effectiveUntil: "2026-01-01" },
    }).success).toBe(false);
    expect(approvedGuidanceBlockSchema.safeParse({
      ...block,
      provenance: { ...contentProvenance, sources: [{ ...contentProvenance.sources[0], license: " " }] },
    }).success).toBe(false);
    expect(approvedGuidanceBlockSchema.safeParse({
      ...block,
      provenance: { ...contentProvenance, sources: [] },
    }).success).toBe(false);
    expect(nutritionContentProvenanceSchema.safeParse({
      ...contentProvenance,
      fixturesSha256: "invalid",
    }).success).toBe(false);
    expect(nutritionContentProvenanceSchema.safeParse({
      ...contentProvenance,
      rightsSha256: "invalid",
    }).success).toBe(false);
    expect(nutritionContentProvenanceSchema.safeParse({
      ...contentProvenance,
      algorithmVersion: "",
    }).success).toBe(false);
    expect(nutritionContentProvenanceSchema.safeParse({
      ...contentProvenance,
      sources: [{ ...contentProvenance.sources[0], authority: "model-claimed" }],
    }).success).toBe(false);
    expect(nutritionContentProvenanceSchema.safeParse({
      ...contentProvenance,
      approved: true,
    }).success).toBe(false);
    const roundTripped = JSON.parse(JSON.stringify(contentProvenance)) as unknown;
    expect(nutritionContentProvenanceSchema.parse(roundTripped)).toEqual(contentProvenance);
  });

  it("accepts deterministic eligibility and educational output while rejecting unsafe result fields", () => {
    const eligibility = nutritionEligibilitySchema.parse({
      contentId: block.id,
      contentType: "block",
      status: "eligible",
      matchedTags: block.tags,
      reasonCodes: ["age_and_readiness_match"],
      missingFacts: [],
      provenance: decisionProvenance,
    });
    expect(eligibility.status).toBe("eligible");

    const result = nutritionGuidanceResultSchema.parse({
      status: "educational_guidance",
      blocks: [block],
      recipes: [recipe],
      exclusions: [{ contentId: recipe.id, code: "peanut", reasonCode: "known_reaction" }],
      provenance: decisionProvenance,
    });
    expect(result.status).toBe("educational_guidance");
    expect(nutritionGuidanceResultSchema.safeParse({
      status: "educational_guidance",
      blocks: [block],
      recipes: [recipe],
      exclusions: [],
      provenance: decisionProvenance,
      diagnosis: "allergy",
    }).success).toBe(false);
    expect(nutritionGuidanceResultSchema.safeParse({
      status: "emergency_only",
      responseMode: "emergency_recommendation",
      reasonCode: "urgent_preflight",
      phoneNumber: "123",
    }).success).toBe(false);

    const insufficient = nutritionGuidanceResultSchema.parse({
      status: "insufficient_data",
      reasonCodes: ["age_unavailable"],
      missingFacts: ["age"],
      provenance: null,
    });
    expect(insufficient.status).toBe("insufficient_data");

    const professionalReview = nutritionGuidanceResultSchema.parse({
      status: "professional_review",
      responseMode: "pediatrician_recommendation",
      reasonCodes: ["professional_plan"],
      provenance: decisionProvenance,
    });
    expect(professionalReview.status).toBe("professional_review");

    const emergencyOnly = nutritionGuidanceResultSchema.parse({
      status: "emergency_only",
      responseMode: "emergency_recommendation",
      reasonCode: "urgent_preflight",
    });
    expect(emergencyOnly).toEqual({
      status: "emergency_only",
      responseMode: "emergency_recommendation",
      reasonCode: "urgent_preflight",
    });
  });
});
