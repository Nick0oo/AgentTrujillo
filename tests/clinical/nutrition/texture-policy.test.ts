import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import type { NutritionCompositionResult } from "../../../src/clinical/nutrition/composer.ts";
import {
  computeTextureSafetyArtifactSha256,
  evaluateTextureSafety,
  type TextureSafetyContext,
  type TextureSafetyRequest,
  type TextureSafetyRule,
  type TextureSafetyRulePack,
} from "../../../src/clinical/nutrition/texture-policy.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const APPROVAL_RECORD = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
const ARTIFACT = "a".repeat(64) as Sha256Hex;
const SOURCE = "b".repeat(64) as Sha256Hex;
const ZERO = "0".repeat(64) as Sha256Hex;

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

const guidance = [
  ["allowed-form", "Use only the approved preparation form."],
  ["transform-form", "Use the approved preparation transformation and supervise the meal."],
  ["excluded-form", "Do not offer this preparation form."],
  ["review-form", "Pause generic guidance and discuss preparation with a pediatrician."],
] as const;

function composition(ingredientCodes: readonly string[]): Extract<NutritionCompositionResult, { status: "composed" }> {
  const recipe = {
    id: "recipe-synthetic",
    title: "Synthetic meal",
    ingredientCodes: [...ingredientCodes],
    preparationSteps: ["Follow the approved preparation block."],
    texture: "soft_lumpy" as const,
    supervision: "required" as const,
    guidance: guidance.map(([id, text]) => ({ id, title: id, text, tags: [id] })),
    allowedSubstitutions: [],
    rationaleCodes: ["age_and_readiness_match"],
    citations: [{
      sourceId: "synthetic-source",
      sourceUri: "https://www.who.int/synthetic/texture",
      sourceVersion: "2026.1",
      artifactSha256: SOURCE,
      license: "synthetic-test-license",
    }],
  };
  const approvedContentIds = [recipe.id, ...recipe.guidance.map((block) => block.id)].sort();
  const provenance = {
    packageId: "nutrition-co-texture",
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

function rule(
  ingredientCode: string,
  formCode: string,
  disposition: TextureSafetyRule["disposition"],
  overrides: Partial<TextureSafetyRule> = {},
): TextureSafetyRule {
  return {
    id: `${ingredientCode}-${formCode}`,
    ingredientCode,
    formCode,
    shapeCode: "not_applicable",
    sizeCode: "not_applicable",
    textureCode: "soft",
    disposition,
    reasonCode: disposition === "allowed" ? "approved_form" : disposition === "transform_required" ? "risky_form_transform" : "risky_form_excluded",
    approvedBlockId: disposition === "allowed" ? "allowed-form" : disposition === "transform_required" ? "transform-form" : "excluded-form",
    transformation: disposition === "transform_required" ? {
      formCode: "approved_transform",
      shapeCode: "not_applicable",
      sizeCode: "not_applicable",
      textureCode: "soft",
    } : null,
    ...overrides,
  };
}

function bindPack(input: Omit<TextureSafetyRulePack, "artifactSha256">): TextureSafetyRulePack {
  const placeholder = { ...input, artifactSha256: ZERO };
  const artifactSha256 = computeTextureSafetyArtifactSha256(placeholder);
  return {
    ...input,
    artifactSha256,
    approval: { ...input.approval, approvedArtifactSha256: artifactSha256 },
  };
}

function pack(rules: readonly TextureSafetyRule[]): TextureSafetyRulePack {
  return bindPack({
    packageId: "nutrition-co-texture-rules",
    packageVersion: "1.0.0",
    country: "CO",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    algorithmVersion: "texture-safety.v1",
    contentArtifactSha256: ARTIFACT,
    fixturesSha256: "c".repeat(64) as Sha256Hex,
    rightsSha256: "d".repeat(64) as Sha256Hex,
    sources: [{
      sourceId: "synthetic-source",
      authority: "WHO",
      jurisdiction: "GLOBAL",
      sourceUri: "https://www.who.int/synthetic/texture",
      artifactSha256: SOURCE,
      license: "synthetic-test-license",
    }],
    rules,
    fallbackBlockIds: {
      reviewRequired: "review-form",
      readinessNotReady: "review-form",
      swallowingConcern: "review-form",
    },
    status: "released",
    current: true,
    revoked: false,
    approval: {
      status: "approved",
      current: true,
      revoked: false,
      digest: "e".repeat(64) as Sha256Hex,
      recordDigest: APPROVAL_RECORD,
      approvedArtifactSha256: ZERO,
    },
  });
}

function presentation(ingredientCode: string, overrides: Partial<TextureSafetyRequest["presentations"][number]> = {}): TextureSafetyRequest["presentations"][number] {
  return {
    ingredientCode,
    formCode: "prepared_soft",
    shapeCode: "not_applicable",
    sizeCode: "not_applicable",
    textureCode: "soft",
    ...overrides,
  };
}

function request(ingredientCodes: readonly string[], overrides: Partial<TextureSafetyRequest> = {}): TextureSafetyRequest {
  return {
    recipeId: "recipe-synthetic",
    presentations: ingredientCodes.map((ingredientCode) => presentation(ingredientCode)),
    ...overrides,
  };
}

function context(
  ingredientCodes: readonly string[],
  rules = ingredientCodes.map((ingredient) => rule(ingredient, "prepared_soft", "allowed")),
  overrides: Partial<TextureSafetyContext> = {},
): TextureSafetyContext {
  return {
    cutoff: NOW,
    revalidatedScope: scope(),
    composition: composition(ingredientCodes),
    feedingApproach: "traditional_complementary",
    readiness: "ready",
    swallowingAbility: "adequate",
    rulePack: pack(rules),
    ...overrides,
  };
}

function evaluate(
  input: TextureSafetyRequest,
  trustedContext: TextureSafetyContext,
  requestScope = scope(),
) {
  return evaluateTextureSafety(requestScope, input, trustedContext);
}

describe("texture and choking policy", () => {
  it("allows an exact approved preparation with approved text and provenance", () => {
    const result = evaluate(request(["lentil"]), context(["lentil"]));

    expect(result).toMatchObject({ ok: true, disposition: { status: "allowed", reasonCodes: ["approved_form"] } });
    if (!result.ok) return;
    expect(result.disposition.approvedText).toEqual([{ blockId: "allowed-form", text: "Use only the approved preparation form." }]);
    expect(result.disposition.provenance).toMatchObject({ algorithmId: "texture-safety", algorithmVersion: "texture-safety.v1" });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ["grape", "whole_round", "round", "whole", "firm", "quarter_lengthwise"],
    ["carrot", "hard_raw", "irregular", "small_hard", "hard", "cooked_soft"],
    ["nut", "thick_butter", "spread", "whole", "sticky", "thin_spread"],
    ["chicken", "bone_in", "irregular", "bite_sized", "soft", "deboned_shredded"],
    ["sausage", "coin_slice", "coin", "coin", "firm", "lengthwise_strip"],
  ] as const)("requires the approved transformation for %s", (ingredient, form, shape, size, texture, target) => {
    const safetyRule = rule(ingredient, form, "transform_required", {
      shapeCode: shape,
      sizeCode: size,
      textureCode: texture,
      transformation: { formCode: target, shapeCode: "not_applicable", sizeCode: "bite_sized_soft", textureCode: "soft" },
    });
    const input = request([ingredient], { presentations: [presentation(ingredient, { formCode: form, shapeCode: shape, sizeCode: size, textureCode: texture })] });
    const result = evaluate(input, context([ingredient], [safetyRule]));

    expect(result).toMatchObject({ ok: true, disposition: { status: "transform_required" } });
    if (result.ok) expect(result.disposition.transformations).toEqual([expect.objectContaining({ ingredientCode: ingredient, to: expect.objectContaining({ formCode: target }) })]);
  });

  it.each([
    ["nut", "whole_nut", "hard"],
    ["rice-cake", "sticky_piece", "sticky"],
  ] as const)("excludes %s in risky form %s", (ingredient, form, texture) => {
    const safetyRule = rule(ingredient, form, "excluded", { textureCode: texture });
    const input = request([ingredient], { presentations: [presentation(ingredient, { formCode: form, textureCode: texture })] });

    expect(evaluate(input, context([ingredient], [safetyRule]))).toMatchObject({
      ok: true,
      disposition: { status: "excluded", approvedText: [{ blockId: "excluded-form" }] },
    });
  });

  it("uses excluded over review over transform over allowed precedence", () => {
    const ingredients = ["lentil", "grape", "nut"];
    const rules = [
      rule("lentil", "prepared_soft", "allowed"),
      rule("grape", "whole_round", "transform_required", { textureCode: "firm" }),
      rule("nut", "whole_nut", "excluded", { textureCode: "hard" }),
    ];
    const input = request(ingredients, { presentations: [
      presentation("lentil"),
      presentation("grape", { formCode: "whole_round", textureCode: "firm" }),
      presentation("nut", { formCode: "whole_nut", textureCode: "hard" }),
    ] });

    expect(evaluate(input, context(ingredients, rules))).toMatchObject({ ok: true, disposition: { status: "excluded" } });
  });

  it("does not hide an unknown preparation behind a known transformation", () => {
    const ingredients = ["grape", "carrot"];
    const rules = [
      rule("grape", "whole_round", "transform_required", { textureCode: "firm" }),
      rule("carrot", "prepared_soft", "allowed"),
    ];
    const input = request(ingredients, { presentations: [
      presentation("grape", { formCode: "whole_round", textureCode: "firm" }),
      presentation("carrot", { formCode: "unknown" }),
    ] });

    expect(evaluate(input, context(ingredients, rules))).toMatchObject({
      ok: true,
      disposition: { status: "review_required", reasonCodes: ["preparation_unknown"] },
    });
  });

  it("requires review for unknown form, missing ingredient, unknown readiness, or swallowing concern", () => {
    const base = context(["lentil"]);
    expect(evaluate(request(["lentil"], { presentations: [presentation("lentil", { formCode: "unknown" })] }), base)).toMatchObject({ disposition: { status: "review_required" } });
    expect(evaluate(request([], { presentations: [] }), base)).toMatchObject({ disposition: { status: "review_required", reasonCodes: ["ingredient_closure_incomplete"] } });
    expect(evaluate(request(["lentil"]), { ...base, readiness: "unknown" })).toMatchObject({ disposition: { status: "review_required" } });
    expect(evaluate(request(["lentil"]), { ...base, swallowingAbility: "concern" })).toMatchObject({ disposition: { status: "review_required" } });
  });

  it("does not let BLW bypass the same rule", () => {
    const safetyRule = rule("grape", "whole_round", "transform_required", { shapeCode: "round", sizeCode: "whole", textureCode: "firm" });
    const input = request(["grape"], { presentations: [presentation("grape", { formCode: "whole_round", shapeCode: "round", sizeCode: "whole", textureCode: "firm" })] });
    const ordinary = evaluate(input, context(["grape"], [safetyRule]));
    const blw = evaluate(input, context(["grape"], [safetyRule], { feedingApproach: "blw" }));

    expect(blw).toEqual(ordinary);
  });

  it("ignores unrelated country-pack rules instead of requiring their blocks in every recipe", () => {
    const rules = [
      rule("lentil", "prepared_soft", "allowed"),
      rule("grape", "whole_round", "transform_required", { approvedBlockId: "unrelated-grape-block" }),
    ];

    expect(evaluate(request(["lentil"]), context(["lentil"], rules))).toMatchObject({
      ok: true,
      disposition: { status: "allowed" },
    });
  });

  it("fails closed for rule-pack checksum, approval, rights, country, and composition drift", () => {
    const base = context(["lentil"]);
    expect(evaluate(request(["lentil"]), { ...base, rulePack: { ...base.rulePack, rightsSha256: ZERO } })).toMatchObject({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });
    expect(evaluate(request(["lentil"]), { ...base, rulePack: { ...base.rulePack, approval: { ...base.rulePack.approval, current: false } } })).toMatchObject({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });
    expect(evaluate(request(["lentil"]), { ...base, rulePack: { ...base.rulePack, country: "US" } })).toMatchObject({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });
    const composed = base.composition as Extract<NutritionCompositionResult, { status: "composed" }>;
    expect(evaluate(request(["lentil"]), { ...base, composition: { ...composed, approvedContentIds: ["mutated"] } })).toMatchObject({ ok: false, reasonCode: "COMPOSITION_INVALID" });
  });

  it.each([
    ["revoked", null],
    ["sibling", scope({ childId: "00000000-0000-4000-8000-000000000004" })],
    ["foreign space", scope({ careSpaceId: "00000000-0000-4000-8000-000000000005" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["read", "record"] })],
  ] as const)("denies %s authorization", (_label, revalidatedScope) => {
    expect(evaluate(request(["lentil"]), context(["lentil"], undefined, { revalidatedScope }))).toMatchObject({ ok: false, reasonCode: "NOT_AUTHORIZED" });
  });

  it("rejects authority, approach, risk-bypass, urgent, and unknown request fields", () => {
    const base = context(["lentil"]);
    expect(evaluate({ ...request(["lentil"]), countryOfCare: "US" } as never, base)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
    expect(evaluate({ ...request(["lentil"]), feedingApproach: "blw" } as never, base)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
    expect(evaluate({ ...request(["lentil"]), ignoreChokingRisk: true } as never, base)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
    expect(evaluate({ ...request(["lentil"]), activeChoking: true } as never, base)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
  });

  it("returns no zero-risk promise, first aid, diagnosis, or operational action", () => {
    const result = evaluate(request(["lentil"]), context(["lentil"]));
    expect(JSON.stringify(result)).not.toMatch(/zero risk|\bsafe\b|first aid|diagnos|call|contact|book|phone|map/i);
  });
});
