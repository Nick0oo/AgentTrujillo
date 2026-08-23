import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import {
  composeNutritionGuidance,
  type NutritionCompositionContext,
  type NutritionCompositionRequest,
} from "../../../src/clinical/nutrition/composer.ts";
import {
  CONVEYED_APPROVAL_RECORD_SHA256,
  NUTRITION_CONTENT_ALGORITHM_VERSION,
  computeNutritionContentArtifactSha256,
  computeNutritionContentEvidence,
  loadNutritionContent,
  type NutritionContentManifest,
  type NutritionContentResolution,
} from "../../../src/clinical/nutrition/content-loader.ts";
import type { NutritionEligibility } from "../../../src/clinical/nutrition/types.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const ZERO = "0".repeat(64) as Sha256Hex;
const FIXTURES = "b".repeat(64) as Sha256Hex;
const RIGHTS = "c".repeat(64) as Sha256Hex;
const APPROVAL = "d".repeat(64) as Sha256Hex;

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

function bind(input: Omit<NutritionContentManifest, "artifactSha256" | "evidence">): NutritionContentManifest {
  const placeholder = { ...input, artifactSha256: ZERO };
  const artifactSha256 = computeNutritionContentArtifactSha256(placeholder);
  const blocks = input.blocks.map((block) => ({ ...block, provenance: { ...block.provenance, artifactSha256 } }));
  const recipes = input.recipes.map((recipe) => ({ ...recipe, provenance: { ...recipe.provenance, artifactSha256 } }));
  return {
    ...input,
    blocks,
    recipes,
    artifactSha256,
    approval: { ...input.approval, approvedArtifactSha256: artifactSha256 },
    evidence: computeNutritionContentEvidence({ ...placeholder, blocks, recipes, artifactSha256 }),
  };
}

function manifest(country: "CO" | "US" = "CO"): NutritionContentManifest {
  const locale = country === "CO" ? "es-CO" : "en-US";
  const packageId = `nutrition-${country.toLowerCase()}-composer`;
  const source = {
    sourceId: `synthetic-${country.toLowerCase()}-source`,
    sourceVersion: "2026.1",
    authority: "WHO" as const,
    jurisdiction: "GLOBAL" as const,
    domain: "nutrition" as const,
    title: "Synthetic nutrition source",
    citation: "Synthetic citation",
    sourceUri: `https://www.who.int/synthetic/${country.toLowerCase()}`,
    publishedAt: "2026-01-01",
    retrievedAt: "2026-08-20T12:00:00.000Z",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    license: "synthetic-test-license",
    artifactSha256: "a".repeat(64) as Sha256Hex,
    status: "approved" as const,
  };
  const provenance = {
    packageId,
    packageVersion: "1.0.0",
    algorithmVersion: NUTRITION_CONTENT_ALGORITHM_VERSION,
    fixturesSha256: FIXTURES,
    rightsSha256: RIGHTS,
    jurisdiction: country,
    locale,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    translation: "original" as const,
    artifactSha256: ZERO,
    approvalDigest: APPROVAL,
    sources: [{
      sourceId: source.sourceId,
      sourceUri: source.sourceUri,
      sourceVersion: source.sourceVersion,
      artifactSha256: source.artifactSha256,
      license: source.license,
      retrievedAt: source.retrievedAt,
    }],
  };
  const blocks = ["lentil", "plantain", "egg"].map((food) => ({
    id: `guidance-${food}`,
    kind: "feeding" as const,
    title: `Offer ${food}`,
    text: `Use the approved ${food} preparation exactly as described.`,
    tags: [food, country === "CO" ? "colombia" : "united_states"],
    minAgeDays: 180,
    maxAgeDays: null,
    provenance,
  }));
  const textures = ["mashed", "soft_lumpy", "finger_food"] as const;
  const recipes = ["lentil", "plantain", "egg"].map((food, index) => ({
    id: `recipe-${food}`,
    title: `${food} meal`,
    ingredientCodes: [food, `${country.toLowerCase()}-staple`],
    guidanceBlockIds: [`guidance-${food}`],
    exclusionCodes: [`avoid-${food}`],
    preparationSteps: [`Prepare ${food} using the approved ${textures[index]} form.`],
    texture: textures[index]!,
    supervision: "required" as const,
    provenance,
  }));
  return bind({
    packageId,
    packageVersion: "1.0.0",
    jurisdiction: country,
    locale,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    algorithmVersion: NUTRITION_CONTENT_ALGORITHM_VERSION,
    fixturesSha256: FIXTURES,
    rightsSha256: RIGHTS,
    translation: "original",
    sources: [source],
    blocks,
    recipes,
    status: "released",
    current: true,
    revoked: false,
    approval: {
      status: "approved",
      current: true,
      revoked: false,
      digest: APPROVAL,
      recordDigest: CONVEYED_APPROVAL_RECORD_SHA256,
      approvedArtifactSha256: ZERO,
      packageId,
      packageVersion: "1.0.0",
    },
  });
}

function content(country: "CO" | "US" = "CO"): Extract<NutritionContentResolution, { ok: true }> {
  const item = manifest(country);
  const resolved = loadNutritionContent({
    countryOfCare: country,
    locale: country === "CO" ? "es-CO" : "en-US",
    asOf: NOW,
    timeZone: country === "CO" ? "America/Bogota" : "America/New_York",
  }, [item]);
  if (!resolved.ok) throw new Error(`synthetic fixture failed: ${resolved.reason}`);
  return resolved;
}

function decision(
  resolved: Extract<NutritionContentResolution, { ok: true }>,
  contentId: string,
  contentType: "block" | "recipe",
  status: NutritionEligibility["status"] = "eligible",
): NutritionEligibility {
  const matchedTags = contentType === "recipe" ? ["meal"] : ["guidance"];
  const reasonCodes = status === "eligible" ? ["age_and_readiness_match"]
    : status === "excluded" ? ["known_reaction"] : ["texture_unknown"];
  const missingFacts = status === "review_required" ? ["texture"] : [];
  const base = {
    packageId: resolved.value.packageId,
    packageVersion: resolved.value.packageVersion,
    artifactSha256: resolved.value.artifactSha256,
    sourceDigests: [...resolved.value.sourceDigests].sort(),
    algorithmId: "nutrition-eligibility",
    algorithmVersion: "nutrition-eligibility.v1",
    inputDigest: hash({ contentId, synthetic: true }),
  };
  return {
    contentId,
    contentType,
    status,
    matchedTags,
    reasonCodes,
    missingFacts,
    provenance: {
      ...base,
      decisionDigest: hash({ status, tags: matchedTags, reasonCodes, missingFacts, provenance: base }),
    },
  };
}

function decisions(resolved: Extract<NutritionContentResolution, { ok: true }>): readonly NutritionEligibility[] {
  return [
    ...resolved.value.blocks.map((block) => decision(resolved, block.id, "block")),
    ...resolved.value.recipes.map((recipe) => decision(resolved, recipe.id, "recipe")),
  ];
}

function request(overrides: Partial<NutritionCompositionRequest> = {}): NutritionCompositionRequest {
  return { seed: "opaque-menu-seed", maxRecipes: 1, ...overrides };
}

function context(
  resolved = content(),
  overrides: Partial<NutritionCompositionContext> = {},
): NutritionCompositionContext {
  return {
    cutoff: NOW,
    revalidatedScope: scope({ countryOfCare: resolved.value.manifest.jurisdiction }),
    content: resolved,
    eligibility: decisions(resolved),
    ...overrides,
  };
}

function compose(
  input = request(),
  trustedContext = context(),
  requestScope = scope(),
) {
  return composeNutritionGuidance(requestScope, input, trustedContext);
}

describe("nutrition guidance composer", () => {
  it("returns only approved recipe, ingredient, guidance, citation, and provenance values", () => {
    const result = compose();

    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.recipes).toHaveLength(1);
    expect(result.approvedContentIds).toEqual(expect.arrayContaining([
      result.recipes[0]!.id,
      ...result.recipes[0]!.guidance.map((block) => block.id),
    ]));
    expect(result.recipes[0]!.ingredientCodes.every((code) => code === "lentil" || code === "plantain" || code === "egg" || code === "co-staple")).toBe(true);
    expect(result.recipes[0]!.citations).toEqual([expect.objectContaining({ sourceId: "synthetic-co-source", sourceUri: expect.stringMatching(/^https:\/\//) })]);
    expect(result.provenance).toMatchObject({ algorithmId: "nutrition-composer", algorithmVersion: "nutrition-composer.v1" });
    expect(result.provenance.compositionDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("opaque-menu-seed");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("honors excluded recipes and records their bounded reason codes", () => {
    const resolved = content();
    const eligibility = decisions(resolved).map((item) => item.contentId === "recipe-lentil"
      ? decision(resolved, item.contentId, "recipe", "excluded") : item);
    const result = compose(request({ maxRecipes: 3 }), context(resolved, { eligibility }));

    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.recipes.map((item) => item.id)).not.toContain("recipe-lentil");
    expect(result.exclusions).toContainEqual({ contentId: "recipe-lentil", reasonCodes: ["known_reaction"] });
  });

  it("requires ingredient closure through every referenced eligible guidance block", () => {
    const resolved = content();
    const eligibility = decisions(resolved).map((item) => item.contentId === "guidance-lentil"
      ? decision(resolved, item.contentId, "block", "excluded") : item);
    const result = compose(request({ maxRecipes: 3 }), context(resolved, { eligibility }));

    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.recipes.map((item) => item.id)).not.toContain("recipe-lentil");
    expect(result.exclusions).toContainEqual({ contentId: "recipe-lentil", reasonCodes: ["guidance_not_eligible"] });
  });

  it("returns no-eligible without improvising food", () => {
    const resolved = content();
    const eligibility = decisions(resolved).map((item) => item.contentType === "recipe"
      ? decision(resolved, item.contentId, "recipe", "excluded") : item);

    expect(compose(request(), context(resolved, { eligibility }))).toMatchObject({
      status: "unavailable",
      reasonCode: "NO_ELIGIBLE_RECIPE",
    });
  });

  it("returns review-required when every candidate needs missing facts", () => {
    const resolved = content();
    const eligibility = decisions(resolved).map((item) => item.contentType === "recipe"
      ? decision(resolved, item.contentId, "recipe", "review_required") : item);

    expect(compose(request(), context(resolved, { eligibility }))).toMatchObject({
      status: "unavailable",
      reasonCode: "REVIEW_REQUIRED",
    });
  });

  it("is deterministic for a seed and provides seeded variety across approved recipes", () => {
    const trustedContext = context();
    const first = compose(request(), trustedContext);
    const second = compose(request(), { ...trustedContext, eligibility: [...trustedContext.eligibility].reverse() });
    const choices = new Set(["a", "b", "c", "d", "e"].map((seed) => {
      const result = compose(request({ seed }), trustedContext);
      return result.status === "composed" ? result.recipes[0]!.id : result.reasonCode;
    }));

    expect(second).toEqual(first);
    expect(choices.size).toBeGreaterThan(1);
  });

  it("offers only complete eligible recipes as substitutions", () => {
    const result = compose();

    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.recipes[0]!.allowedSubstitutions).toHaveLength(2);
    expect(result.recipes[0]!.allowedSubstitutions.every((item) => item.kind === "whole_recipe" && item.ingredientCodes.length > 0)).toBe(true);
    expect(result.recipes[0]!.allowedSubstitutions.flatMap((item) => item.ingredientCodes).every((code) => code === "lentil" || code === "plantain" || code === "egg" || code === "co-staple")).toBe(true);
  });

  it("keeps Colombia and United States content separate", () => {
    const us = content("US");
    const usScope = scope({ countryOfCare: "US", timezone: "America/New_York" });
    const result = composeNutritionGuidance(usScope, request({ maxRecipes: 3 }), context(us, {
      revalidatedScope: usScope,
    }));

    expect(result.status).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.recipes.flatMap((item) => item.ingredientCodes)).toContain("us-staple");
    expect(result.recipes.flatMap((item) => item.ingredientCodes)).not.toContain("co-staple");
  });

  it("fails closed on package mutation after content resolution", () => {
    const resolved = content();
    const changed = {
      ...resolved,
      value: {
        ...resolved.value,
        manifest: {
          ...resolved.value.manifest,
          recipes: [{ ...resolved.value.manifest.recipes[0]!, title: "Mutated title" }, ...resolved.value.manifest.recipes.slice(1)],
        },
      },
    } as NutritionContentResolution;

    expect(compose(request(), context(resolved, { content: changed }))).toMatchObject({ status: "unavailable", reasonCode: "CONTENT_DRIFT" });
  });

  it("fails closed on decision digest drift, duplicate decisions, and foreign IDs", () => {
    const resolved = content();
    const base = decisions(resolved);
    const drifted = [{ ...base[0]!, reasonCodes: ["age_and_readiness_match", "bypass"] }, ...base.slice(1)];
    const duplicate = [...base, base[0]!];
    const foreign = [...base, decision(resolved, "recipe-foreign", "recipe")];

    expect(compose(request(), context(resolved, { eligibility: drifted }))).toMatchObject({ reasonCode: "ELIGIBILITY_INVALID" });
    expect(compose(request(), context(resolved, { eligibility: duplicate }))).toMatchObject({ reasonCode: "ELIGIBILITY_INVALID" });
    expect(compose(request(), context(resolved, { eligibility: foreign }))).toMatchObject({ reasonCode: "ELIGIBILITY_INVALID" });
  });

  it.each([
    ["revoked", null],
    ["sibling", scope({ childId: "00000000-0000-4000-8000-000000000004" })],
    ["foreign space", scope({ careSpaceId: "00000000-0000-4000-8000-000000000005" })],
    ["actor drift", scope({ actorUserId: "00000000-0000-4000-8000-000000000006" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["read", "record"] })],
  ] as const)("denies %s authorization context", (_label, revalidatedScope) => {
    expect(compose(request(), context(content(), { revalidatedScope }))).toMatchObject({ status: "unavailable", reasonCode: "NOT_AUTHORIZED" });
  });

  it("rejects model-supplied authority, country, and bypass fields", () => {
    expect(compose({ ...request(), childId: "sibling" } as never)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
    expect(compose({ ...request(), countryOfCare: "US" } as never)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
    expect(compose({ ...request(), ignoreAllergies: true } as never)).toMatchObject({ reasonCode: "INVALID_REQUEST" });
  });

  it("fails closed for an unavailable content resolution and invalid cutoff", () => {
    const unavailable: NutritionContentResolution = {
      ok: false,
      code: "NUTRITION_CONTENT_UNAVAILABLE",
      reason: "REVOKED",
      digest: hash({ unavailable: true }),
    };
    expect(compose(request(), context(content(), { content: unavailable }))).toMatchObject({ reasonCode: "CONTENT_UNAVAILABLE" });
    expect(compose(request(), context(content(), { cutoff: new Date("invalid") }))).toMatchObject({ reasonCode: "NOT_AUTHORIZED" });
  });
});
