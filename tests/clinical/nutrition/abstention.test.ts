import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import {
  applyNutritionAbstention,
  type NutritionAbstentionContext,
} from "../../../src/clinical/nutrition/abstention.ts";
import type { NutritionCompositionResult } from "../../../src/clinical/nutrition/composer.ts";
import type { NutritionContentResolution } from "../../../src/clinical/nutrition/content-loader.ts";
import type { TextureSafetyResult } from "../../../src/clinical/nutrition/texture-policy.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";
import type { SafetyDecision } from "../../../src/safety/message-types.ts";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ARTIFACT = "a".repeat(64) as Sha256Hex;
const SOURCE = "b".repeat(64) as Sha256Hex;
const APPROVAL = "c".repeat(64) as Sha256Hex;
const APPROVAL_RECORD = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function scope(overrides: Partial<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly string[];
  countryOfCare: string;
  timezone: string;
  expiresAt: Date;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: "00000000-0000-4000-8000-000000000001",
    careSpaceId: "00000000-0000-4000-8000-000000000002",
    childId: "00000000-0000-4000-8000-000000000003",
    permissions: ["read"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date("2026-08-23T11:59:00.000Z"),
    expiresAt: new Date("2026-08-23T12:04:00.000Z"),
    ...overrides,
  });
}

function composition(text = "Offer the approved preparation while supervising the meal."): Extract<NutritionCompositionResult, { status: "composed" }> {
  const recipe = {
    id: "recipe-lentil",
    title: "Lentil meal",
    ingredientCodes: ["lentil"],
    preparationSteps: ["Mash to the approved texture."],
    texture: "mashed" as const,
    supervision: "required" as const,
    guidance: [{ id: "guidance-lentil", title: "Lentil guidance", text, tags: ["lentil"] }],
    allowedSubstitutions: [],
    rationaleCodes: ["age_and_readiness_match"],
    citations: [{
      sourceId: "synthetic-source",
      sourceUri: "https://www.who.int/synthetic/nutrition",
      sourceVersion: "2026.1",
      artifactSha256: SOURCE,
      license: "synthetic-test-license",
    }],
  };
  const approvedContentIds = [recipe.guidance[0]!.id, recipe.id];
  const provenance = {
    packageId: "nutrition-co-synthetic",
    packageVersion: "1.0.0",
    artifactSha256: ARTIFACT,
    sourceDigests: [SOURCE],
    algorithmId: "nutrition-composer" as const,
    algorithmVersion: "nutrition-composer.v1" as const,
    contentResolutionDigest: hash({ content: true }),
    eligibilityDecisionDigests: [hash({ eligible: true })],
    seedDigest: hash("seed"),
    inputDigest: hash({ input: true }),
  };
  return {
    status: "composed",
    approvedContentIds,
    recipes: [recipe],
    exclusions: [],
    provenance: {
      ...provenance,
      compositionDigest: hash({ approvedContentIds, recipes: [recipe], exclusions: [], provenance }),
    },
  };
}

function content(composed = composition()): NutritionContentResolution {
  return {
    ok: true,
    value: {
      manifest: { jurisdiction: "CO", locale: "es-CO" },
      packageId: composed.provenance.packageId,
      packageVersion: composed.provenance.packageVersion,
      artifactSha256: composed.provenance.artifactSha256,
      sourceDigests: composed.provenance.sourceDigests,
      rightsDigest: hash({ rights: true }),
      licenseDigest: hash({ license: true }),
      approvalDigest: APPROVAL,
      approvalRecordDigest: APPROVAL_RECORD,
      digest: composed.provenance.contentResolutionDigest,
    },
  } as NutritionContentResolution;
}

function texture(
  composed = composition(),
  status: "allowed" | "transform_required" | "excluded" | "review_required" = "allowed",
  reasonCode = status === "allowed" ? "approved_form" : status === "transform_required" ? "risky_form_transform" : status === "excluded" ? "risky_form_excluded" : "preparation_unknown",
): TextureSafetyResult {
  const approvedText = [{ blockId: "guidance-lentil", text: composed.recipes[0]!.guidance[0]!.text }];
  const transformations = status === "transform_required" ? [{
    ingredientCode: "lentil",
    from: { formCode: "whole", shapeCode: "round", sizeCode: "whole", textureCode: "firm" },
    to: { formCode: "mashed", shapeCode: "not_applicable", sizeCode: "bite_sized", textureCode: "soft" },
    approvedBlockId: "guidance-lentil",
  }] : [];
  const provenance = {
    packageId: "texture-co-synthetic",
    packageVersion: "1.0.0",
    artifactSha256: hash({ texturePack: true }),
    sourceDigests: [SOURCE],
    algorithmId: "texture-safety" as const,
    algorithmVersion: "texture-safety.v1" as const,
    inputDigest: hash({ textureInput: true }),
  };
  return {
    ok: true,
    disposition: {
      status,
      recipeId: composed.recipes[0]!.id,
      reasonCodes: [reasonCode],
      approvedText,
      transformations,
      provenance: {
        ...provenance,
        decisionDigest: hash({ status, recipeId: composed.recipes[0]!.id, reasonCodes: [reasonCode], approvedText, transformations, provenance }),
      },
    },
  };
}

const notUrgent: SafetyDecision = { decision: "not_urgent", responseMode: "continue" };

function context(overrides: Partial<NutritionAbstentionContext> = {}): NutritionAbstentionContext {
  const composed = composition();
  return {
    cutoff: NOW,
    revalidatedScope: scope(),
    safetyDecision: notUrgent,
    content: content(composed),
    composition: composed,
    texture: texture(composed),
    signals: {
      age: "in_scope",
      reaction: "none",
      swallowing: "none",
      growthOrCondition: "none",
      specialDiet: "none",
      professionalPlan: "none",
      facts: "complete",
    },
    ...overrides,
  };
}

function apply(trustedContext = context(), requestScope = scope()) {
  return applyNutritionAbstention(requestScope, trustedContext);
}

describe("nutrition abstention policy", () => {
  it("returns approved educational guidance only when every boundary passes", () => {
    const result = apply();

    expect(result).toMatchObject({ status: "educational_guidance", responseMode: "educational" });
    if (result.status !== "educational_guidance") return;
    expect(result.composition.recipes.map((recipe) => recipe.id)).toEqual(["recipe-lentil"]);
    expect(result.texture.status).toBe("allowed");
    expect(result.provenance.decisionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("preserves urgent precedence without adding text or operations", () => {
    const urgent: SafetyDecision = {
      decision: "urgent",
      responseMode: "emergency_recommendation",
      ruleCodes: ["synthetic_reaction"],
      copyKey: "emergency_department_es_co_v1",
    };
    const result = apply(context({
      safetyDecision: urgent,
      content: { ok: false, code: "NUTRITION_CONTENT_UNAVAILABLE", reason: "REVOKED", digest: hash({ unavailable: true }) },
      signals: { ...context().signals, reaction: "active" },
    }));

    expect(result).toEqual({ status: "emergency_only", responseMode: "emergency_recommendation", reasonCode: "urgent_preflight" });
    expect(result).not.toHaveProperty("text");
    expect(JSON.stringify(result)).not.toMatch(/phone|call|contact|map|location|book|doctor|treatment/i);
  });

  it("uses the safety professional-review decision before nutrition output", () => {
    const safetyDecision: SafetyDecision = { decision: "professional_review", responseMode: "pediatrician_recommendation", reasonCode: "needs_review" };
    expect(apply(context({ safetyDecision }))).toMatchObject({ status: "professional_review", responseMode: "pediatrician_recommendation" });
  });

  it.each([
    ["reaction", "active"],
    ["swallowing", "concern"],
    ["growthOrCondition", "concern"],
    ["specialDiet", "active"],
    ["professionalPlan", "active"],
    ["age", "out_of_scope"],
    ["facts", "conflicting"],
  ] as const)("suppresses guidance and recommends pediatric review for %s=%s", (field, value) => {
    const base = context();
    const result = apply({ ...base, signals: { ...base.signals, [field]: value } });

    expect(result).toMatchObject({ status: "professional_review", responseMode: "pediatrician_recommendation" });
    if (result.status === "professional_review") {
      expect(result.recommendation.text).toBe("Consulte con un pediatra para revisar esta situación.");
      expect(result.recommendation).not.toHaveProperty("phone");
      expect(result.recommendation).not.toHaveProperty("booking");
    }
  });

  it.each([
    ["reaction", "unknown"],
    ["swallowing", "unknown"],
    ["growthOrCondition", "unknown"],
    ["specialDiet", "unknown"],
    ["professionalPlan", "unknown"],
    ["age", "unknown"],
    ["facts", "missing"],
  ] as const)("returns insufficient data for %s=%s", (field, value) => {
    const base = context();
    expect(apply({ ...base, signals: { ...base.signals, [field]: value } })).toMatchObject({ status: "insufficient_data" });
  });

  it("maps unavailable package and no eligible recipe to insufficient data", () => {
    const base = context();
    const unavailable: NutritionContentResolution = { ok: false, code: "NUTRITION_CONTENT_UNAVAILABLE", reason: "REVOKED", digest: hash({ unavailable: true }) };
    const noRecipe: NutritionCompositionResult = { status: "unavailable", reasonCode: "NO_ELIGIBLE_RECIPE", provenance: null };

    expect(apply({ ...base, content: unavailable })).toMatchObject({ status: "insufficient_data", reasonCodes: ["content_unavailable"] });
    expect(apply({ ...base, composition: noRecipe })).toMatchObject({ status: "insufficient_data", reasonCodes: ["no_eligible_recipe"] });
  });

  it("maps composition or texture review to a pediatrician recommendation", () => {
    const base = context();
    const reviewComposition: NutritionCompositionResult = { status: "unavailable", reasonCode: "REVIEW_REQUIRED", provenance: null };
    const reviewTexture = texture(base.composition as Extract<NutritionCompositionResult, { status: "composed" }>, "review_required");

    expect(apply({ ...base, composition: reviewComposition })).toMatchObject({ status: "professional_review" });
    expect(apply({ ...base, texture: reviewTexture })).toMatchObject({ status: "professional_review" });
  });

  it("suppresses a recipe whose texture disposition is excluded", () => {
    const base = context();
    const excluded = texture(base.composition as Extract<NutritionCompositionResult, { status: "composed" }>, "excluded");
    expect(apply({ ...base, texture: excluded })).toMatchObject({ status: "insufficient_data", reasonCodes: ["texture_excluded"] });
  });

  it("allows an exact approved transformation without weakening it", () => {
    const base = context();
    const transformed = texture(base.composition as Extract<NutritionCompositionResult, { status: "composed" }>, "transform_required");
    const result = apply({ ...base, texture: transformed });

    expect(result).toMatchObject({ status: "educational_guidance", texture: { status: "transform_required" } });
  });

  it("treats reaction, swallowing, growth, and plan exclusions as professional review even when another recipe was composed", () => {
    for (const reasonCode of ["known_reaction", "swallowing_concern", "poor_growth_or_condition", "special_diet", "professional_plan"]) {
      const base = context();
      const composed = base.composition as Extract<NutritionCompositionResult, { status: "composed" }>;
      const exclusions = [{ contentId: "recipe-excluded", reasonCodes: [reasonCode] }];
      const { compositionDigest: _digest, ...provenance } = composed.provenance;
      const changed = {
        ...composed,
        exclusions,
        provenance: { ...provenance, compositionDigest: hash({ approvedContentIds: composed.approvedContentIds, recipes: composed.recipes, exclusions, provenance }) },
      };
      expect(apply({ ...base, composition: changed })).toMatchObject({ status: "professional_review" });
    }
  });

  it("does not hide unresolved restriction or texture uncertainty behind another eligible recipe", () => {
    const base = context();
    const composed = base.composition as Extract<NutritionCompositionResult, { status: "composed" }>;
    const withExclusion = (reasonCode: string) => {
      const exclusions = [{ contentId: "recipe-excluded", reasonCodes: [reasonCode] }];
      const { compositionDigest: _digest, ...provenance } = composed.provenance;
      return {
        ...composed,
        exclusions,
        provenance: { ...provenance, compositionDigest: hash({ approvedContentIds: composed.approvedContentIds, recipes: composed.recipes, exclusions, provenance }) },
      };
    };

    expect(apply({ ...base, composition: withExclusion("unknown_restriction") })).toMatchObject({ status: "professional_review" });
    expect(apply({ ...base, composition: withExclusion("texture_unknown") })).toMatchObject({
      status: "insufficient_data",
      reasonCodes: ["eligibility_information_incomplete"],
    });
  });

  it("rejects package, approval, source, composition, and texture digest drift", () => {
    const base = context();
    const successful = base.content as Extract<NutritionContentResolution, { ok: true }>;
    const composed = base.composition as Extract<NutritionCompositionResult, { status: "composed" }>;
    const safeTexture = base.texture as Extract<TextureSafetyResult, { ok: true }>;

    expect(apply({ ...base, content: { ...successful, value: { ...successful.value, approvalRecordDigest: hash({ wrong: true }) } } as NutritionContentResolution })).toMatchObject({ status: "insufficient_data" });
    expect(apply({ ...base, content: { ...successful, value: { ...successful.value, sourceDigests: [hash({ wrong: true })] } } as NutritionContentResolution })).toMatchObject({ status: "insufficient_data" });
    expect(apply({ ...base, composition: { ...composed, approvedContentIds: ["mutated"] } })).toMatchObject({ status: "insufficient_data" });
    expect(apply({ ...base, texture: { ...safeTexture, disposition: { ...safeTexture.disposition, reasonCodes: ["mutated"] } } })).toMatchObject({ status: "insufficient_data" });
  });

  it("applies response-policy defense in depth to prohibited approved-content drift", () => {
    const unsafe = composition("This treatment plan is definitely safe.");
    const base = context({ content: content(unsafe), composition: unsafe, texture: texture(unsafe) });
    expect(apply(base)).toMatchObject({ status: "professional_review", reasonCodes: ["content_policy_blocked"] });
  });

  it.each([
    ["revoked", null],
    ["sibling", scope({ childId: "00000000-0000-4000-8000-000000000004" })],
    ["foreign space", scope({ careSpaceId: "00000000-0000-4000-8000-000000000005" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["read", "record"] })],
  ] as const)("blocks %s authorization without guidance", (_label, revalidatedScope) => {
    expect(apply(context({ revalidatedScope }))).toMatchObject({ status: "insufficient_data", reasonCodes: ["authorization_unavailable"] });
  });

  it("is deterministic and keeps Colombia/US recommendation copy separate", () => {
    const first = apply();
    const second = apply(structuredClone(context()));
    const usScope = scope({ countryOfCare: "US", timezone: "America/New_York" });
    const base = context({ revalidatedScope: usScope, signals: { ...context().signals, reaction: "active" } });
    const english = applyNutritionAbstention(usScope, base);

    expect(second).toEqual(first);
    expect(english).toMatchObject({ status: "professional_review", recommendation: { text: "Consult a pediatrician to review this situation.", locale: "en-US" } });
  });
});
