import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import type {
  FoodReactionEvidence,
  FoodReactionQuerySuccess,
} from "../../application/nutrition/food-reaction-query.ts";
import type {
  NutritionProfileProjection,
  NutritionProfileQuerySuccess,
} from "../../application/nutrition/nutrition-profile-query.ts";
import type { Sha256Hex } from "../governance/source-types.ts";
import {
  nutritionContentProvenanceSchema,
  nutritionContextSchema,
  type FoodRestriction,
  type NutritionContext,
  type NutritionContentProvenance,
  type NutritionDecisionProvenance,
  type NutritionEligibility,
  type NutritionEligibilityStatus,
  type NutritionTextureStage,
} from "./types.ts";

const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
const ZERO_DIGEST = "0".repeat(64) as Sha256Hex;
const ALGORITHM_ID = "nutrition-eligibility";
const ALGORITHM_VERSION = "nutrition-eligibility.v1";
const AGE_ALGORITHM_VERSION = "chronological-age.v1";
const PROFILE_QUERY_ALGORITHM_VERSION = "nutrition-profile-query.v1";
const REACTION_QUERY_ALGORITHM_VERSION = "food-reaction-query.v1";
const MAX_PEDIATRIC_AGE_DAYS = 18 * 366;
const REACTION_TYPES = ["allergy", "intolerance", "preference", "avoidance"] as const;
const REACTION_SEVERITIES = ["mild", "moderate", "severe", "unknown"] as const;
const REACTION_STATUSES = ["declared", "confirmed", "resolved", "entered_in_error"] as const;
const REACTION_LIFECYCLES = ["active", "resolved", "entered_in_error"] as const;
const REACTION_CONFIRMATIONS = ["declared", "confirmed", "unknown"] as const;
const REACTION_UNCERTAINTIES = ["unmapped_food", "supersession_unavailable", "confirmation_uncertain", "duplicate_identity", "conflicting_evidence"] as const;
const REACTION_PROVENANCE = ["guardian", "professional", "import", "document", "chat"] as const;

const digestSchema = z.string().regex(DIGEST, "SHA-256 digest");
const codeSchema = z.string().regex(CODE, "code");
const concernSchema = z.enum(["none", "active", "unknown"]);

export type NutritionEligibilityConcern = z.infer<typeof concernSchema>;

export type NutritionEligibilityGovernance = Readonly<{
  packageId: string;
  packageVersion: string;
  country: "CO" | "US";
  sourceDigests: readonly Sha256Hex[];
  artifactSha256: Sha256Hex;
  algorithmId: string;
  algorithmVersion: string;
  fixturesSha256: Sha256Hex;
  rightsSha256: Sha256Hex;
  approvalDigest: Sha256Hex;
  approvalRecordDigest: Sha256Hex;
  approvalProvenance: "product_owner_conveyed";
  releaseStatus: "active";
}>;

export type NutritionEligibilityPolicy = Readonly<{
  country: "CO" | "US";
  contentId: string;
  contentType: "block" | "recipe";
  tags: readonly string[];
  ingredientCodes: readonly string[];
  minAgeDays: number;
  maxAgeDays: number | null;
  readiness: "required" | "ready" | "not_required" | "any";
  texture: NutritionTextureStage | "any";
  supervision: "required" | "recommended" | "not_required";
  provenance: NutritionContentProvenance;
  governance: NutritionEligibilityGovernance;
}>;

/** Internal aggregate assembled only from trusted scoped query results. */
export type NutritionEligibilityContext = Readonly<NutritionContext & {
  countryOfCare: "CO" | "US";
  cutoff: string;
  profile: NutritionProfileQuerySuccess;
  reactions: FoodReactionQuerySuccess;
  concerns: Readonly<{
    swallowing: NutritionEligibilityConcern;
    poorGrowthOrCondition: NutritionEligibilityConcern;
    specialDiet: NutritionEligibilityConcern;
  }>;
}>;

const governanceSchema = z.object({
  packageId: codeSchema,
  packageVersion: codeSchema,
  country: z.enum(["CO", "US"]),
  sourceDigests: z.array(digestSchema).min(1).max(100).readonly(),
  artifactSha256: digestSchema,
  algorithmId: codeSchema,
  algorithmVersion: codeSchema,
  fixturesSha256: digestSchema,
  rightsSha256: digestSchema,
  approvalDigest: digestSchema,
  approvalRecordDigest: digestSchema,
  approvalProvenance: z.literal("product_owner_conveyed"),
  releaseStatus: z.literal("active"),
}).strict().superRefine((value, refinement) => {
  if (new Set(value.sourceDigests).size !== value.sourceDigests.length) {
    refinement.addIssue({ code: "custom", path: ["sourceDigests"], message: "duplicate source digests" });
  }
});

const policySchema = z.object({
  country: z.enum(["CO", "US"]),
  contentId: codeSchema,
  contentType: z.enum(["block", "recipe"]),
  tags: z.array(codeSchema).min(1).max(100).readonly(),
  ingredientCodes: z.array(codeSchema).max(100).readonly(),
  minAgeDays: z.number().int().nonnegative(),
  maxAgeDays: z.number().int().nonnegative().nullable(),
  readiness: z.enum(["required", "ready", "not_required", "any"]),
  texture: z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "any"]),
  supervision: z.enum(["required", "recommended", "not_required"]),
  provenance: nutritionContentProvenanceSchema,
  governance: governanceSchema,
}).strict().superRefine((value, refinement) => {
  if (value.maxAgeDays !== null && value.maxAgeDays < value.minAgeDays) {
    refinement.addIssue({ code: "custom", path: ["maxAgeDays"], message: "maxAgeDays precedes minAgeDays" });
  }
  if (value.contentType === "recipe" && value.ingredientCodes.length === 0) {
    refinement.addIssue({ code: "custom", path: ["ingredientCodes"], message: "recipe requires ingredients" });
  }
  if (new Set(value.tags.map((tag) => tag.toLocaleLowerCase("en-US"))).size !== value.tags.length) {
    refinement.addIssue({ code: "custom", path: ["tags"], message: "duplicate tags" });
  }
  if (new Set(value.ingredientCodes.map((code) => code.toLocaleLowerCase("en-US"))).size !== value.ingredientCodes.length) {
    refinement.addIssue({ code: "custom", path: ["ingredientCodes"], message: "duplicate ingredients" });
  }
  const sourceIds = value.provenance.sources.map((source) => source.sourceId);
  const sourceDigests = value.provenance.sources.map((source) => source.artifactSha256);
  if (new Set(sourceIds).size !== sourceIds.length) {
    refinement.addIssue({ code: "custom", path: ["provenance", "sources"], message: "duplicate source IDs" });
  }
  if (new Set(sourceDigests).size !== sourceDigests.length) {
    refinement.addIssue({ code: "custom", path: ["provenance", "sources"], message: "duplicate source digests" });
  }
});

type State = {
  readonly hard: Set<string>;
  readonly review: Set<string>;
  readonly missing: Set<string>;
};

function state(): State {
  return { hard: new Set(), review: new Set(), missing: new Set() };
}

function hard(result: State, code: string): void {
  result.hard.add(code);
}

function review(result: State, code: string, missing?: string): void {
  result.review.add(code);
  if (missing !== undefined) result.missing.add(missing);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): readonly string[] {
  return [...new Set(values)].sort(compare);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function canonicalDigest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function localCalendarDate(instant: string, timeZone: string): string | null {
  try {
    const date = new Date(instant);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year === undefined || month === undefined || day === undefined) return null;
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function canonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function profileIsValid(profile: unknown): profile is NutritionProfileProjection {
  if (!isRecord(profile) || !Array.isArray(profile.exclusions) || !isRecord(profile.source)) return false;
  return profile.exclusions.every((value) => typeof value === "string" && CODE.test(value))
    && (profile.feedingApproach === null || typeof profile.feedingApproach === "string")
    && (profile.textureStage === null || typeof profile.textureStage === "string")
    && typeof profile.source.sourceId === "string"
    && typeof profile.source.createdAt === "string"
    && typeof profile.source.updatedAt === "string";
}

function reactionIsValid(value: unknown): value is FoodReactionEvidence {
  if (!isRecord(value)) return false;
  const identity = value.identity;
  const declaration = value.declaration;
  const confirmation = value.confirmation;
  const provenance = value.provenance;
  return isRecord(identity)
    && typeof identity.id === "string"
    && typeof identity.foodLabel === "string"
    && (identity.foodCode === null || typeof identity.foodCode === "string")
    && (identity.mapping === "normalized" || identity.mapping === "unmapped")
    && isRecord(declaration)
    && isOneOf(declaration.reactionType, REACTION_TYPES)
    && (declaration.severity === null || isOneOf(declaration.severity, REACTION_SEVERITIES))
    && isOneOf(declaration.status, REACTION_STATUSES)
    && isOneOf(declaration.lifecycle, REACTION_LIFECYCLES)
    && declaration.lifecycle === (declaration.status === "resolved" ? "resolved" : declaration.status === "entered_in_error" ? "entered_in_error" : "active")
    && isRecord(confirmation)
    && isOneOf(confirmation.status, REACTION_CONFIRMATIONS)
    && confirmation.status === (declaration.status === "confirmed" ? "confirmed" : declaration.status === "declared" ? "declared" : "unknown")
    && value.supersession === "unknown"
    && Array.isArray(value.uncertainty)
    && value.uncertainty.every((item) => isOneOf(item, REACTION_UNCERTAINTIES))
    && new Set(value.uncertainty).size === value.uncertainty.length
    && isRecord(provenance)
    && isOneOf(provenance.provenanceType, REACTION_PROVENANCE)
    && (provenance.observedOn === null || typeof provenance.observedOn === "string")
    && typeof provenance.createdAt === "string"
    && typeof provenance.updatedAt === "string";
}

function profileQueryIsValid(value: unknown, cutoff: string): value is NutritionProfileQuerySuccess {
  if (!isRecord(value)
    || value.ok !== true
    || value.status !== "available"
    || value.professionalPlan !== "unknown"
    || !digestSchema.safeParse(value.digest).success
    || !profileIsValid(value.profile)
    || !isRecord(value.completeness)
    || !canonicalInstant(value.age && isRecord(value.age) ? value.age.referenceInstant : null)
    || !isRecord(value.age)
    || value.age.referenceInstant !== cutoff) return false;
  const completeness = {
    age: "complete",
    feedingApproach: value.profile.feedingApproach === null ? "missing" : "complete",
    textureStage: value.profile.textureStage === null ? "missing" : "complete",
    exclusions: "complete",
    professionalPlan: "unknown",
  };
  return canonicalize(value.completeness) === canonicalize(completeness)
    && canonicalDigest({
      algorithmVersion: PROFILE_QUERY_ALGORITHM_VERSION,
      cutoff,
      age: value.age,
      profile: value.profile,
      professionalPlan: value.professionalPlan,
      completeness: value.completeness,
    }) === value.digest;
}

function reactionQueryIsValid(value: unknown, cutoff: string): value is FoodReactionQuerySuccess {
  if (!isRecord(value)
    || value.ok !== true
    || value.status !== "available"
    || !digestSchema.safeParse(value.digest).success
    || !Array.isArray(value.reactions)
    || !value.reactions.every(reactionIsValid)) return false;
  return canonicalDigest({
    algorithmVersion: REACTION_QUERY_ALGORITHM_VERSION,
    cutoff,
    reactions: value.reactions,
  }) === value.digest;
}

function contentCodes(policy: NutritionEligibilityPolicy): ReadonlySet<string> {
  return new Set([...policy.ingredientCodes, ...policy.tags, policy.contentId].map((value) => value.toLocaleLowerCase("en-US")));
}

function sourceDigests(provenance: NutritionContentProvenance): readonly Sha256Hex[] {
  return sorted(provenance.sources.map((source) => source.artifactSha256)) as Sha256Hex[];
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function checkGovernance(policy: NutritionEligibilityPolicy, result: State, referenceDate: string | null): void {
  const { provenance, governance } = policy;
  if (policy.country !== governance.country || policy.country !== provenance.jurisdiction) hard(result, "country_mismatch");
  if (governance.packageId !== provenance.packageId || governance.packageVersion !== provenance.packageVersion) hard(result, "provenance_drift");
  if (governance.artifactSha256 !== provenance.artifactSha256) hard(result, "artifact_drift");
  if (governance.fixturesSha256 !== provenance.fixturesSha256) hard(result, "fixtures_drift");
  if (governance.rightsSha256 !== provenance.rightsSha256) hard(result, "rights_drift");
  if (governance.approvalDigest !== provenance.approvalDigest) hard(result, "approval_drift");
  if (governance.approvalRecordDigest !== APPROVAL_RECORD_DIGEST) hard(result, "approval_drift");
  if (governance.approvalProvenance !== "product_owner_conveyed" || governance.releaseStatus !== "active") hard(result, "approval_not_active");
  if (governance.algorithmId !== ALGORITHM_ID
    || governance.algorithmVersion !== ALGORITHM_VERSION
    || provenance.algorithmVersion !== ALGORITHM_VERSION) hard(result, "algorithm_drift");
  if (!exactStrings(sourceDigests(provenance), governance.sourceDigests)) hard(result, "source_drift");
  if (referenceDate !== null
    && (referenceDate < provenance.effectiveFrom
      || (provenance.effectiveUntil !== null && referenceDate > provenance.effectiveUntil))) hard(result, "provenance_drift");
}

function applyRestrictions(restrictions: readonly FoodRestriction[], codes: ReadonlySet<string>, result: State): void {
  for (const restriction of restrictions) {
    if (restriction.state === "resolved" || restriction.state === "entered_in_error") continue;
    if (restriction.state === "unknown") {
      review(result, "unknown_restriction", "restriction_resolution");
      continue;
    }
    if (restriction.kind === "preference" || restriction.kind === "dislike") continue;
    const foodCode = restriction.foodCode?.toLocaleLowerCase("en-US");
    if (foodCode === null || foodCode === undefined) review(result, "unmapped_restriction", "food_mapping");
    else if (codes.has(foodCode)) hard(result, "known_reaction");
  }
}

function applyReactions(reactions: readonly FoodReactionEvidence[], codes: ReadonlySet<string>, result: State): void {
  for (const evidence of reactions) {
    if (evidence.declaration.lifecycle === "resolved" || evidence.declaration.lifecycle === "entered_in_error") continue;
    if (evidence.declaration.lifecycle !== "active"
      || !["declared", "confirmed"].includes(evidence.declaration.status)) {
      review(result, "reaction_confirmation_unknown", "reaction_resolution");
      continue;
    }
    if (evidence.uncertainty.includes("conflicting_evidence") || evidence.uncertainty.includes("duplicate_identity")) {
      review(result, "conflicting_reaction", "reaction_resolution");
    }
    if (evidence.identity.mapping !== "normalized" || evidence.identity.foodCode === null) {
      review(result, "unmapped_reaction", "food_mapping");
      continue;
    }
    if (codes.has(evidence.identity.foodCode.toLocaleLowerCase("en-US"))) hard(result, "known_reaction");
    if (evidence.confirmation.status === "unknown") review(result, "reaction_confirmation_unknown", "reaction_resolution");
  }
}

function textureRank(texture: NutritionTextureStage): number {
  return ["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food"].indexOf(texture);
}

function applyContext(context: NutritionEligibilityContext, policy: NutritionEligibilityPolicy, result: State): void {
  if (context.countryOfCare !== policy.country) hard(result, "country_mismatch");
  if (context.age.basis !== "chronological"
    || context.age.provenance.provenanceType !== "system"
    || context.age.algorithmVersion !== AGE_ALGORITHM_VERSION) hard(result, "age_untrusted");
  if (context.age.ageDays > MAX_PEDIATRIC_AGE_DAYS) hard(result, "age_invalid");

  const referenceDate = localCalendarDate(context.age.referenceInstant, context.age.timeZone);
  if (referenceDate === null) review(result, "age_missing", "age");
  else if (context.age.ageDays < policy.minAgeDays || (policy.maxAgeDays !== null && context.age.ageDays > policy.maxAgeDays)) hard(result, "age_out_of_range");

  const readinessRequired = policy.readiness === "required" || policy.readiness === "ready";
  if (readinessRequired && context.readiness.status === "not_ready") hard(result, "readiness_not_ready");
  else if (readinessRequired && context.readiness.status !== "ready") review(result, `readiness_${context.readiness.status}`, "readiness");

  if (context.textureStage === null || context.textureStage === "unknown") review(result, "texture_unknown", "texture");
  else if (policy.texture !== "any" && textureRank(context.textureStage) < textureRank(policy.texture)) review(result, "texture_mismatch", "texture");
  if (context.profile.profile.textureStage !== null && context.profile.profile.textureStage !== context.textureStage) review(result, "texture_context_conflict", "texture");

  const codes = contentCodes(policy);
  for (const exclusion of context.profile.profile.exclusions) {
    if (codes.has(exclusion.toLocaleLowerCase("en-US"))) hard(result, "profile_exclusion");
  }
  applyRestrictions(context.restrictions, codes, result);
  applyReactions(context.reactions.reactions, codes, result);

  if (context.concerns.swallowing === "active") review(result, "swallowing_concern", "swallowing");
  else if (context.concerns.swallowing === "unknown") review(result, "swallowing_concern_unknown", "swallowing");
  if (context.concerns.specialDiet === "active") review(result, "special_diet", "dietary_plan");
  else if (context.concerns.specialDiet === "unknown") review(result, "special_diet_unknown", "dietary_plan");
  if (context.concerns.poorGrowthOrCondition === "active") review(result, "poor_growth_or_condition", "growth_or_condition");
  else if (context.concerns.poorGrowthOrCondition === "unknown") review(result, "poor_growth_or_condition_unknown", "growth_or_condition");
  if (context.professionalPlan === "active") review(result, "professional_plan", "professional_plan");
  else if (context.professionalPlan === "unknown") review(result, "professional_plan_unknown", "professional_plan");
}

function contextMaterial(context: NutritionEligibilityContext): unknown {
  const sortObjects = <T>(values: readonly T[]): readonly T[] => [...values].sort((left, right) => compare(canonicalize(left), canonicalize(right)));
  const profile = {
    ...context.profile,
    profile: {
      ...context.profile.profile,
      exclusions: sorted(context.profile.profile.exclusions),
    },
  };
  const reactions = {
    ...context.reactions,
    reactions: sortObjects(context.reactions.reactions),
  };
  return {
    countryOfCare: context.countryOfCare,
    cutoff: context.cutoff,
    age: context.age,
    readiness: context.readiness,
    feedingApproach: context.feedingApproach,
    textureStage: context.textureStage,
    restrictions: sortObjects(context.restrictions),
    professionalPlan: context.professionalPlan,
    profile,
    reactions,
    concerns: context.concerns,
  };
}

function provenanceMaterial(provenance: NutritionContentProvenance): unknown {
  return {
    ...provenance,
    sources: [...provenance.sources].sort((left, right) => compare(canonicalize(left), canonicalize(right))),
  };
}

function policyMaterial(policy: NutritionEligibilityPolicy): unknown {
  return {
    country: policy.country,
    contentId: policy.contentId,
    contentType: policy.contentType,
    tags: sorted(policy.tags),
    ingredientCodes: sorted(policy.ingredientCodes),
    minAgeDays: policy.minAgeDays,
    maxAgeDays: policy.maxAgeDays,
    readiness: policy.readiness,
    texture: policy.texture,
    supervision: policy.supervision,
    provenance: provenanceMaterial(policy.provenance),
    governance: {
      ...policy.governance,
      sourceDigests: sorted(policy.governance.sourceDigests),
    },
  };
}

function decisionProvenance(policy: NutritionEligibilityPolicy, inputDigest: Sha256Hex, result: State, status: NutritionEligibilityStatus, tags: readonly string[]): NutritionDecisionProvenance {
  const base = {
    packageId: policy.governance.packageId,
    packageVersion: policy.governance.packageVersion,
    artifactSha256: policy.governance.artifactSha256,
    sourceDigests: sorted(policy.governance.sourceDigests) as Sha256Hex[],
    algorithmId: policy.governance.algorithmId,
    algorithmVersion: policy.governance.algorithmVersion,
    inputDigest,
  };
  return {
    ...base,
    decisionDigest: canonicalDigest({ status, tags, reasonCodes: sorted([...result.hard, ...result.review]), missingFacts: sorted(result.missing), provenance: base }),
  };
}

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
  return Object.freeze(value);
}

function fallback(input: unknown, reasonCode = "policy_invalid"): NutritionEligibility {
  const inputDigest = (() => {
    try { return canonicalDigest(input); } catch { return ZERO_DIGEST; }
  })();
  const decisionDigest = canonicalDigest({ status: "excluded", reasonCode, inputDigest });
  return freeze({
    contentId: isRecord(input) && typeof input.contentId === "string" ? input.contentId : "unavailable",
    contentType: isRecord(input) && input.contentType === "recipe" ? "recipe" : "block",
    status: "excluded",
    matchedTags: [],
    reasonCodes: [reasonCode],
    missingFacts: [],
    provenance: {
      packageId: "unavailable",
      packageVersion: "unavailable",
      artifactSha256: ZERO_DIGEST,
      sourceDigests: [ZERO_DIGEST],
      algorithmId: ALGORITHM_ID,
      algorithmVersion: ALGORITHM_VERSION,
      inputDigest,
      decisionDigest,
    },
  });
}

export function evaluateNutritionEligibility(
  contextInput: NutritionEligibilityContext,
  policyInput: NutritionEligibilityPolicy,
): NutritionEligibility {
  const result = state();
  try {
    const policyParsed = policySchema.safeParse(policyInput);
    if (!policyParsed.success) {
      return fallback(policyInput, isRecord(policyInput) && policyInput.governance === undefined ? "governance_missing" : "policy_invalid");
    }
    const policy = policyParsed.data as NutritionEligibilityPolicy;
    if (policy.ingredientCodes.some((code) => ["unknown", "unmapped", "unknown_ingredient", "unmapped_food"].includes(code.toLocaleLowerCase("en-US")))) {
      hard(result, "unknown_ingredient");
    }
    const contextRecord = isRecord(contextInput) ? contextInput : null;
    if (contextRecord === null || (contextRecord.countryOfCare !== "CO" && contextRecord.countryOfCare !== "US")) return fallback(contextInput, "context_invalid");
    if (!canonicalInstant(contextRecord.cutoff)) return fallback(contextInput, "context_invalid");
    const contextParsed = nutritionContextSchema.safeParse({
      age: contextRecord.age,
      readiness: contextRecord.readiness,
      feedingApproach: contextRecord.feedingApproach,
      textureStage: contextRecord.textureStage,
      restrictions: contextRecord.restrictions,
      professionalPlan: contextRecord.professionalPlan,
    });
    if (!contextParsed.success) return fallback(contextInput, "context_invalid");
    const profileValue: unknown = contextRecord.profile;
    const reactionsValue: unknown = contextRecord.reactions;
    if (profileValue === undefined
      || (isRecord(profileValue) && profileValue.ok === false)) return fallback(contextInput, "profile_query_unavailable");
    if (reactionsValue === undefined
      || (isRecord(reactionsValue) && reactionsValue.ok === false)) return fallback(contextInput, "reaction_query_unavailable");
    if (!profileQueryIsValid(profileValue, contextRecord.cutoff)) return fallback(contextInput, "profile_query_invalid");
    if (!reactionQueryIsValid(reactionsValue, contextRecord.cutoff)) return fallback(contextInput, "reaction_query_invalid");
    if (canonicalize(contextRecord.age) !== canonicalize(profileValue.age)
      || contextRecord.feedingApproach !== profileValue.profile.feedingApproach
      || contextRecord.textureStage !== profileValue.profile.textureStage
      || contextRecord.professionalPlan !== profileValue.professionalPlan) {
      return fallback(contextInput, "query_context_mismatch");
    }
    const concerns = z.object({ swallowing: concernSchema, poorGrowthOrCondition: concernSchema, specialDiet: concernSchema }).strict().safeParse(contextRecord.concerns);
    if (!concerns.success) return fallback(contextInput, "context_invalid");
    const context = {
      ...contextParsed.data,
      countryOfCare: contextRecord.countryOfCare,
      cutoff: contextRecord.cutoff,
      profile: profileValue,
      reactions: reactionsValue,
      concerns: concerns.data,
    } as unknown as NutritionEligibilityContext;
    const referenceDate = localCalendarDate(context.age.referenceInstant, context.age.timeZone);
    checkGovernance(policy, result, referenceDate);
    applyContext(context, policy, result);
    const status: NutritionEligibilityStatus = result.hard.size > 0 ? "excluded" : result.review.size > 0 ? "review_required" : "eligible";
    if (status === "eligible") result.review.add("age_and_readiness_match");
    const tags = sorted(policy.tags);
    const inputDigest = canonicalDigest({ context: contextMaterial(context), policy: policyMaterial(policy) });
    return freeze({
      contentId: policy.contentId,
      contentType: policy.contentType,
      status,
      matchedTags: tags,
      reasonCodes: sorted([...result.hard, ...result.review]),
      missingFacts: sorted(result.missing),
      provenance: decisionProvenance(policy, inputDigest, result, status, tags),
    });
  } catch {
    return fallback(policyInput);
  }
}
