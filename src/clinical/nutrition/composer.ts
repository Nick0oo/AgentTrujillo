import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Sha256Hex } from "../governance/source-types.ts";
import {
  loadNutritionContent,
  type NutritionContentResolution,
} from "./content-loader.ts";
import {
  nutritionEligibilitySchema,
  type ApprovedGuidanceBlock,
  type NutritionEligibility,
  type NutritionSourceProvenance,
  type RecipeTemplate,
} from "./types.ts";

const ALGORITHM_ID = "nutrition-composer";
const ALGORITHM_VERSION = "nutrition-composer.v1";
const ELIGIBILITY_ALGORITHM_ID = "nutrition-eligibility";
const ELIGIBILITY_ALGORITHM_VERSION = "nutrition-eligibility.v1";

const requestSchema = z.object({
  seed: z.string().min(1).max(128),
  maxRecipes: z.number().int().min(1).max(7),
}).strict();

export type NutritionCompositionRequest = Readonly<z.infer<typeof requestSchema>>;

/** Trusted orchestration context; none of these fields belong in a model-facing schema. */
export type NutritionCompositionContext = Readonly<{
  cutoff: Date;
  revalidatedScope: AuthorizedChildScope | null;
  content: NutritionContentResolution;
  eligibility: readonly NutritionEligibility[];
}>;

export type NutritionCompositionUnavailableReason =
  | "NOT_AUTHORIZED"
  | "INVALID_REQUEST"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_DRIFT"
  | "ELIGIBILITY_INVALID"
  | "NO_ELIGIBLE_RECIPE"
  | "REVIEW_REQUIRED"
  | "INTERNAL_ERROR";

export type NutritionCitation = Readonly<Pick<
  NutritionSourceProvenance,
  "sourceId" | "sourceUri" | "sourceVersion" | "artifactSha256" | "license"
>>;

export type ApprovedWholeRecipeSubstitution = Readonly<{
  kind: "whole_recipe";
  recipeId: string;
  title: string;
  ingredientCodes: readonly string[];
}>;

export type ComposedNutritionGuidance = Readonly<{
  id: string;
  title: string;
  text: string;
  tags: readonly string[];
}>;

export type ComposedNutritionRecipe = Readonly<{
  id: string;
  title: string;
  ingredientCodes: readonly string[];
  preparationSteps: readonly string[];
  texture: RecipeTemplate["texture"];
  supervision: RecipeTemplate["supervision"];
  guidance: readonly ComposedNutritionGuidance[];
  allowedSubstitutions: readonly ApprovedWholeRecipeSubstitution[];
  rationaleCodes: readonly string[];
  citations: readonly NutritionCitation[];
}>;

export type NutritionCompositionProvenance = Readonly<{
  packageId: string;
  packageVersion: string;
  artifactSha256: Sha256Hex;
  sourceDigests: readonly Sha256Hex[];
  algorithmId: typeof ALGORITHM_ID;
  algorithmVersion: typeof ALGORITHM_VERSION;
  contentResolutionDigest: Sha256Hex;
  eligibilityDecisionDigests: readonly Sha256Hex[];
  seedDigest: Sha256Hex;
  inputDigest: Sha256Hex;
  compositionDigest: Sha256Hex;
}>;

export type NutritionCompositionResult =
  | Readonly<{
      status: "composed";
      approvedContentIds: readonly string[];
      recipes: readonly ComposedNutritionRecipe[];
      exclusions: readonly Readonly<{ contentId: string; reasonCodes: readonly string[] }>[];
      provenance: NutritionCompositionProvenance;
    }>
  | Readonly<{
      status: "unavailable";
      reasonCode: NutritionCompositionUnavailableReason;
      provenance: null;
    }>;

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compare));
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  const first = sorted(left);
  const second = sorted(right);
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function unavailable(reasonCode: NutritionCompositionUnavailableReason): NutritionCompositionResult {
  return Object.freeze({ status: "unavailable", reasonCode, provenance: null });
}

function currentScope(request: AuthorizedChildScope, fresh: AuthorizedChildScope | null, cutoff: Date): fresh is AuthorizedChildScope {
  return fresh !== null
    && hasPermission(request, "read", cutoff)
    && hasPermission(fresh, "read", cutoff)
    && sameAuthorizedChildScope(request, fresh)
    && request.countryOfCare === fresh.countryOfCare
    && request.timezone === fresh.timezone
    && fresh.permissions.every((permission) => request.permissions.includes(permission));
}

function verifiedContent(
  scope: AuthorizedChildScope,
  cutoff: Date,
  resolution: NutritionContentResolution,
): Extract<NutritionContentResolution, { ok: true }> | null {
  if (!resolution.ok || resolution.value.manifest.jurisdiction !== scope.countryOfCare) return null;
  const manifest = resolution.value.manifest;
  const fresh = loadNutritionContent({
    countryOfCare: manifest.jurisdiction,
    locale: manifest.locale,
    asOf: cutoff,
    timeZone: scope.timezone,
  }, [manifest]);
  return fresh.ok && canonicalize(fresh.value) === canonicalize(resolution.value) ? fresh : null;
}

function exactOrdered(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || compare(values[index - 1]!, value) < 0);
}

function validDecision(
  raw: NutritionEligibility,
  resolution: Extract<NutritionContentResolution, { ok: true }>,
  contentTypes: ReadonlyMap<string, "block" | "recipe">,
): NutritionEligibility | null {
  const parsed = nutritionEligibilitySchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data as NutritionEligibility;
  if (contentTypes.get(value.contentId) !== value.contentType
    || value.provenance.packageId !== resolution.value.packageId
    || value.provenance.packageVersion !== resolution.value.packageVersion
    || value.provenance.artifactSha256 !== resolution.value.artifactSha256
    || value.provenance.algorithmId !== ELIGIBILITY_ALGORITHM_ID
    || value.provenance.algorithmVersion !== ELIGIBILITY_ALGORITHM_VERSION
    || !exactStrings(value.provenance.sourceDigests, resolution.value.sourceDigests)
    || !exactOrdered(value.matchedTags)
    || !exactOrdered(value.reasonCodes)
    || !exactOrdered(value.missingFacts)) return null;
  const { decisionDigest: _decisionDigest, ...provenance } = value.provenance;
  const expected = hash({
    status: value.status,
    tags: value.matchedTags,
    reasonCodes: value.reasonCodes,
    missingFacts: value.missingFacts,
    provenance,
  });
  return expected === value.provenance.decisionDigest ? value : null;
}

function citations(blocks: readonly ApprovedGuidanceBlock[], recipe: RecipeTemplate): readonly NutritionCitation[] {
  const byId = new Map<string, NutritionCitation>();
  for (const source of [recipe, ...blocks].flatMap((item) => item.provenance.sources)) {
    byId.set(`${source.sourceId}:${source.artifactSha256}`, {
      sourceId: source.sourceId,
      sourceUri: source.sourceUri,
      sourceVersion: source.sourceVersion,
      artifactSha256: source.artifactSha256,
      license: source.license,
    });
  }
  return Object.freeze([...byId.values()].sort((left, right) => compare(left.sourceId, right.sourceId)
    || compare(left.artifactSha256, right.artifactSha256)));
}

type EligibleRecipe = Readonly<{
  recipe: RecipeTemplate;
  blocks: readonly ApprovedGuidanceBlock[];
  rationaleCodes: readonly string[];
}>;

function wholeRecipeAlternative(candidate: EligibleRecipe): ApprovedWholeRecipeSubstitution {
  return Object.freeze({
    kind: "whole_recipe",
    recipeId: candidate.recipe.id,
    title: candidate.recipe.title,
    ingredientCodes: Object.freeze([...candidate.recipe.ingredientCodes]),
  });
}

/**
 * Pure composition boundary. It selects only whole approved recipes; it never
 * creates an ingredient substitution, therapeutic plan, dose, or food challenge.
 */
export function composeNutritionGuidance(
  requestScope: AuthorizedChildScope,
  rawRequest: NutritionCompositionRequest,
  context: NutritionCompositionContext,
): NutritionCompositionResult {
  try {
    const cutoff = context.cutoff;
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())
      || !currentScope(requestScope, context.revalidatedScope, cutoff)) return unavailable("NOT_AUTHORIZED");
    const requestResult = requestSchema.safeParse(rawRequest);
    if (!requestResult.success) return unavailable("INVALID_REQUEST");
    if (!context.content.ok) return unavailable("CONTENT_UNAVAILABLE");
    const content = verifiedContent(requestScope, cutoff, context.content);
    if (content === null) return unavailable("CONTENT_DRIFT");
    if (!Array.isArray(context.eligibility) || context.eligibility.length > 200) return unavailable("ELIGIBILITY_INVALID");

    const contentTypes = new Map<string, "block" | "recipe">([
      ...content.value.blocks.map((block) => [block.id, "block"] as const),
      ...content.value.recipes.map((recipe) => [recipe.id, "recipe"] as const),
    ]);
    const decisions = new Map<string, NutritionEligibility>();
    for (const rawDecision of context.eligibility) {
      const decision = validDecision(rawDecision, content, contentTypes);
      if (decision === null || decisions.has(decision.contentId)) return unavailable("ELIGIBILITY_INVALID");
      decisions.set(decision.contentId, decision);
    }

    const blocks = new Map(content.value.blocks.map((block) => [block.id, block]));
    const candidates: EligibleRecipe[] = [];
    const exclusions: Array<Readonly<{ contentId: string; reasonCodes: readonly string[] }>> = [];
    let needsReview = false;
    for (const recipe of content.value.recipes) {
      const recipeDecision = decisions.get(recipe.id);
      if (recipeDecision?.status !== "eligible") {
        if (recipeDecision?.status === "review_required") needsReview = true;
        exclusions.push({
          contentId: recipe.id,
          reasonCodes: recipeDecision === undefined ? ["eligibility_missing"] : [...recipeDecision.reasonCodes],
        });
        continue;
      }
      const guidance = recipe.guidanceBlockIds.map((id) => blocks.get(id));
      const guidanceDecisions = recipe.guidanceBlockIds.map((id) => decisions.get(id));
      if (guidance.some((item) => item === undefined)
        || guidanceDecisions.some((item) => item?.status !== "eligible")) {
        if (guidanceDecisions.some((item) => item?.status === "review_required")) needsReview = true;
        exclusions.push({ contentId: recipe.id, reasonCodes: ["guidance_not_eligible"] });
        continue;
      }
      candidates.push({
        recipe,
        blocks: guidance as ApprovedGuidanceBlock[],
        rationaleCodes: sorted([
          ...recipeDecision.reasonCodes,
          ...guidanceDecisions.flatMap((item) => item?.reasonCodes ?? []),
        ]),
      });
    }
    if (candidates.length === 0) return unavailable(needsReview ? "REVIEW_REQUIRED" : "NO_ELIGIBLE_RECIPE");

    const request = requestResult.data;
    const seedDigest = hash(request.seed);
    const ranked = [...candidates].sort((left, right) => compare(
      hash({ seedDigest, contentDigest: content.value.digest, recipeId: left.recipe.id }),
      hash({ seedDigest, contentDigest: content.value.digest, recipeId: right.recipe.id }),
    ) || compare(left.recipe.id, right.recipe.id));
    const selected = ranked.slice(0, request.maxRecipes);
    const selectedIds = new Set(selected.map((item) => item.recipe.id));
    const alternatives = ranked.filter((item) => !selectedIds.has(item.recipe.id));
    const recipes: readonly ComposedNutritionRecipe[] = selected.map((candidate) => ({
      id: candidate.recipe.id,
      title: candidate.recipe.title,
      ingredientCodes: [...candidate.recipe.ingredientCodes],
      preparationSteps: [...candidate.recipe.preparationSteps],
      texture: candidate.recipe.texture,
      supervision: candidate.recipe.supervision,
      guidance: candidate.blocks.map((block) => ({ id: block.id, title: block.title, text: block.text, tags: [...block.tags] })),
      allowedSubstitutions: alternatives.map(wholeRecipeAlternative),
      rationaleCodes: candidate.rationaleCodes,
      citations: citations(candidate.blocks, candidate.recipe),
    }));
    const approvedContentIds = sorted(selected.flatMap((item) => [item.recipe.id, ...item.blocks.map((block) => block.id)]));
    const normalizedExclusions = exclusions
      .map((item) => ({ contentId: item.contentId, reasonCodes: sorted(item.reasonCodes) }))
      .sort((left, right) => compare(left.contentId, right.contentId));
    const eligibilityDecisionDigests = sorted([...decisions.values()].map((item) => item.provenance.decisionDigest)) as readonly Sha256Hex[];
    const provenanceBase = {
      packageId: content.value.packageId,
      packageVersion: content.value.packageVersion,
      artifactSha256: content.value.artifactSha256,
      sourceDigests: sorted(content.value.sourceDigests) as readonly Sha256Hex[],
      algorithmId: ALGORITHM_ID as typeof ALGORITHM_ID,
      algorithmVersion: ALGORITHM_VERSION as typeof ALGORITHM_VERSION,
      contentResolutionDigest: content.value.digest,
      eligibilityDecisionDigests,
      seedDigest,
      inputDigest: hash({
        cutoff: cutoff.toISOString(),
        countryOfCare: requestScope.countryOfCare,
        timeZone: requestScope.timezone,
        maxRecipes: request.maxRecipes,
        seedDigest,
        contentResolutionDigest: content.value.digest,
        eligibilityDecisionDigests,
      }),
    };
    const compositionDigest = hash({
      approvedContentIds,
      recipes,
      exclusions: normalizedExclusions,
      provenance: provenanceBase,
    });
    return deepFreeze({
      status: "composed",
      approvedContentIds,
      recipes,
      exclusions: normalizedExclusions,
      provenance: { ...provenanceBase, compositionDigest },
    });
  } catch {
    return unavailable("INTERNAL_ERROR");
  }
}
