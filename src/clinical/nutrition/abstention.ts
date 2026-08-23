import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import { createClinicalResponsePolicy } from "../../safety/clinical-response-policy.ts";
import type { SafetyDecision } from "../../safety/message-types.ts";
import {
  renderProfessionalReview,
  type ProfessionalReviewReason,
} from "../../safety/professional-review-policy.ts";
import type { Sha256Hex } from "../governance/source-types.ts";
import type { NutritionCompositionResult } from "./composer.ts";
import type { NutritionContentResolution } from "./content-loader.ts";
import type { TextureDisposition, TextureSafetyResult } from "./texture-policy.ts";

const DIGEST = /^[a-f0-9]{64}$/u;
const ZERO_DIGEST = "0".repeat(64);
const APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00";
const ALGORITHM_ID = "nutrition-abstention";
const ALGORITHM_VERSION = "nutrition-abstention.v1";

export type NutritionAbstentionSignals = Readonly<{
  age: "in_scope" | "out_of_scope" | "unknown";
  reaction: "none" | "active" | "unknown";
  swallowing: "none" | "concern" | "unknown";
  growthOrCondition: "none" | "concern" | "unknown";
  specialDiet: "none" | "active" | "unknown";
  professionalPlan: "none" | "active" | "unknown";
  facts: "complete" | "missing" | "conflicting";
}>;

export type NutritionAbstentionContext = Readonly<{
  cutoff: Date;
  revalidatedScope: AuthorizedChildScope | null;
  safetyDecision: SafetyDecision;
  content: NutritionContentResolution;
  composition: NutritionCompositionResult;
  texture: TextureSafetyResult;
  /** Trusted deterministic aggregate; never a model-facing request body. */
  signals: NutritionAbstentionSignals;
}>;

export type NutritionAbstentionProvenance = Readonly<{
  algorithmId: typeof ALGORITHM_ID;
  algorithmVersion: typeof ALGORITHM_VERSION;
  inputDigest: Sha256Hex;
  decisionDigest: Sha256Hex;
}>;

export type NutritionAbstentionResult =
  | Readonly<{
      status: "educational_guidance";
      responseMode: "educational";
      composition: Extract<NutritionCompositionResult, { status: "composed" }>;
      texture: TextureDisposition;
      provenance: NutritionAbstentionProvenance;
    }>
  | Readonly<{
      status: "insufficient_data";
      reasonCodes: readonly string[];
      missingFacts: readonly string[];
      provenance: NutritionAbstentionProvenance | null;
    }>
  | Readonly<{
      status: "professional_review";
      responseMode: "pediatrician_recommendation";
      reasonCodes: readonly string[];
      recommendation: Readonly<{
        type: "pediatrician_recommendation";
        text: string;
        locale: "es-CO" | "en-US";
        messageId: string;
      }>;
      provenance: NutritionAbstentionProvenance;
    }>
  | Readonly<{
      status: "emergency_only";
      responseMode: "emergency_recommendation";
      reasonCode: "urgent_preflight" | "safety_decision_invalid";
    }>;

const signalsSchema = z.object({
  age: z.enum(["in_scope", "out_of_scope", "unknown"]),
  reaction: z.enum(["none", "active", "unknown"]),
  swallowing: z.enum(["none", "concern", "unknown"]),
  growthOrCondition: z.enum(["none", "concern", "unknown"]),
  specialDiet: z.enum(["none", "active", "unknown"]),
  professionalPlan: z.enum(["none", "active", "unknown"]),
  facts: z.enum(["complete", "missing", "conflicting"]),
}).strict();

const safetyDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("urgent"),
    responseMode: z.literal("emergency_recommendation"),
    ruleCodes: z.array(z.string().min(1).max(128)).min(1).max(100).readonly(),
    copyKey: z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]),
  }).strict(),
  z.object({ decision: z.literal("clarification_required"), responseMode: z.literal("clarify"), question: z.enum(["clarify_subject_or_timing_v1", "clarify_temperature_unit_v1"]) }).strict(),
  z.object({ decision: z.literal("professional_review"), responseMode: z.literal("pediatrician_recommendation"), reasonCode: z.string().min(1).max(128) }).strict(),
  z.object({ decision: z.literal("not_urgent"), responseMode: z.literal("continue") }).strict(),
  z.object({ decision: z.literal("indeterminate"), responseMode: z.literal("abstain"), reasonCode: z.string().min(1).max(128) }).strict(),
]);

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

function currentScope(request: AuthorizedChildScope, fresh: AuthorizedChildScope | null, cutoff: Date): fresh is AuthorizedChildScope {
  return fresh !== null
    && hasPermission(request, "read", cutoff)
    && hasPermission(fresh, "read", cutoff)
    && sameAuthorizedChildScope(request, fresh)
    && request.countryOfCare === fresh.countryOfCare
    && request.timezone === fresh.timezone
    && fresh.permissions.every((permission) => request.permissions.includes(permission));
}

function validComposition(composition: NutritionCompositionResult): composition is Extract<NutritionCompositionResult, { status: "composed" }> {
  if (composition.status !== "composed"
    || composition.provenance.algorithmId !== "nutrition-composer"
    || composition.provenance.algorithmVersion !== "nutrition-composer.v1") return false;
  const { compositionDigest, ...provenance } = composition.provenance;
  return hash({
    approvedContentIds: composition.approvedContentIds,
    recipes: composition.recipes,
    exclusions: composition.exclusions,
    provenance,
  }) === compositionDigest;
}

function isDigest(value: unknown): value is Sha256Hex {
  return typeof value === "string" && DIGEST.test(value) && value !== ZERO_DIGEST;
}

function validContent(
  content: NutritionContentResolution,
  scope: AuthorizedChildScope,
  composition: Extract<NutritionCompositionResult, { status: "composed" }>,
): boolean {
  if (!content.ok) return false;
  const value = content.value;
  return value.manifest?.jurisdiction === scope.countryOfCare
    && value.manifest?.locale === (scope.countryOfCare === "CO" ? "es-CO" : "en-US")
    && value.packageId === composition.provenance.packageId
    && value.packageVersion === composition.provenance.packageVersion
    && value.artifactSha256 === composition.provenance.artifactSha256
    && value.digest === composition.provenance.contentResolutionDigest
    && exactStrings(value.sourceDigests, composition.provenance.sourceDigests)
    && value.sourceDigests.length > 0
    && value.sourceDigests.every(isDigest)
    && isDigest(value.rightsDigest)
    && isDigest(value.licenseDigest)
    && isDigest(value.approvalDigest)
    && value.approvalRecordDigest === APPROVAL_RECORD_DIGEST;
}

function validTexture(
  texture: TextureSafetyResult,
  composition: Extract<NutritionCompositionResult, { status: "composed" }>,
): texture is Extract<TextureSafetyResult, { ok: true }> {
  if (!texture.ok
    || !composition.recipes.some((recipe) => recipe.id === texture.disposition.recipeId)
    || !exactStrings(texture.disposition.provenance.sourceDigests, composition.provenance.sourceDigests)) return false;
  const { decisionDigest, ...provenance } = texture.disposition.provenance;
  const expected = hash({
    status: texture.disposition.status,
    recipeId: texture.disposition.recipeId,
    reasonCodes: texture.disposition.reasonCodes,
    approvedText: texture.disposition.approvedText,
    transformations: texture.disposition.transformations,
    provenance,
  });
  if (expected !== decisionDigest) return false;
  const recipe = composition.recipes.find((item) => item.id === texture.disposition.recipeId)!;
  const blocks = new Map(recipe.guidance.map((block) => [block.id, block.text]));
  return texture.disposition.approvedText.every((item) => blocks.get(item.blockId) === item.text)
    && texture.disposition.transformations.every((item) => blocks.has(item.approvedBlockId));
}

function provenance(
  context: NutritionAbstentionContext,
  outcome: string,
  reasonCodes: readonly string[],
): NutritionAbstentionProvenance {
  const input = {
    safetyDecision: context.safetyDecision,
    signals: context.signals,
    contentDigest: context.content.ok ? context.content.value.digest : context.content.digest,
    compositionDigest: context.composition.status === "composed" ? context.composition.provenance.compositionDigest : null,
    textureDigest: context.texture.ok ? context.texture.disposition.provenance.decisionDigest : null,
    cutoff: context.cutoff.toISOString(),
  };
  const inputDigest = hash(input);
  return Object.freeze({
    algorithmId: ALGORITHM_ID,
    algorithmVersion: ALGORITHM_VERSION,
    inputDigest,
    decisionDigest: hash({ outcome, reasonCodes: sorted(reasonCodes), inputDigest }),
  });
}

function insufficient(
  context: NutritionAbstentionContext,
  reasonCodes: readonly string[],
  missingFacts: readonly string[] = [],
  withProvenance = true,
): NutritionAbstentionResult {
  const reasons = sorted(reasonCodes);
  return deepFreeze({
    status: "insufficient_data",
    reasonCodes: reasons,
    missingFacts: sorted(missingFacts),
    provenance: withProvenance ? provenance(context, "insufficient_data", reasons) : null,
  });
}

function professionalReason(reasonCodes: readonly string[]): ProfessionalReviewReason {
  if (reasonCodes.includes("facts_conflicting")) return "uncertain_nonurgent";
  if (reasonCodes.includes("age_out_of_scope") || reasonCodes.includes("special_diet") || reasonCodes.includes("professional_plan")) return "outside_basic_scope";
  return "needs_examination";
}

function professional(
  context: NutritionAbstentionContext,
  scope: AuthorizedChildScope,
  reasonCodes: readonly string[],
): NutritionAbstentionResult {
  const reasons = sorted(reasonCodes);
  const locale = scope.countryOfCare === "CO" ? "es-CO" as const : "en-US" as const;
  const rendered = renderProfessionalReview(professionalReason(reasons), locale, context.safetyDecision);
  if (rendered.mode !== "pediatrician_recommendation") return Object.freeze({ status: "emergency_only", responseMode: "emergency_recommendation", reasonCode: "urgent_preflight" });
  return deepFreeze({
    status: "professional_review",
    responseMode: "pediatrician_recommendation",
    reasonCodes: reasons,
    recommendation: rendered.publicResponse,
    provenance: provenance(context, "professional_review", reasons),
  });
}

const professionalExclusions = new Set([
  "known_reaction",
  "conflicting_reaction",
  "reaction_confirmation_unknown",
  "unmapped_reaction",
  "unknown_restriction",
  "unmapped_restriction",
  "swallowing_concern",
  "poor_growth_or_condition",
  "special_diet",
  "professional_plan",
]);

const incompleteExclusions = new Set([
  "age_missing",
  "readiness_unknown",
  "readiness_review_required",
  "texture_unknown",
  "texture_mismatch",
  "texture_context_conflict",
  "swallowing_concern_unknown",
  "poor_growth_or_condition_unknown",
  "special_diet_unknown",
  "professional_plan_unknown",
  "eligibility_missing",
  "guidance_not_eligible",
]);

/** Final nutrition gate. Urgent output is rendered only by Module 04, never here. */
export function applyNutritionAbstention(
  requestScope: AuthorizedChildScope,
  context: NutritionAbstentionContext,
): NutritionAbstentionResult {
  try {
    const cutoff = context.cutoff;
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())
      || !currentScope(requestScope, context.revalidatedScope, cutoff)) {
      return insufficient(context, ["authorization_unavailable"], [], false);
    }

    const rawDecision = context.safetyDecision as SafetyDecision & { decision?: string };
    const safety = safetyDecisionSchema.safeParse(rawDecision);
    if (rawDecision?.decision === "urgent") {
      const expectedCopy = requestScope.countryOfCare === "CO" ? "emergency_department_es_co_v1" : "emergency_department_en_us_v1";
      return Object.freeze({
        status: "emergency_only",
        responseMode: "emergency_recommendation",
        reasonCode: safety.success && safety.data.decision === "urgent" && safety.data.copyKey === expectedCopy
          ? "urgent_preflight" : "safety_decision_invalid",
      });
    }
    if (!safety.success) return insufficient(context, ["safety_decision_invalid"]);
    if (safety.data.decision === "professional_review") return professional(context, requestScope, ["safety_professional_review"]);
    if (safety.data.decision === "clarification_required" || safety.data.decision === "indeterminate") {
      return insufficient(context, ["safety_information_incomplete"], ["safety_clarification"]);
    }

    const signals = signalsSchema.safeParse(context.signals);
    if (!signals.success) return insufficient(context, ["clinical_context_invalid"]);
    const active: string[] = [];
    if (signals.data.reaction === "active") active.push("reaction_active");
    if (signals.data.swallowing === "concern") active.push("swallowing_concern");
    if (signals.data.growthOrCondition === "concern") active.push("growth_or_condition_concern");
    if (signals.data.specialDiet === "active") active.push("special_diet");
    if (signals.data.professionalPlan === "active") active.push("professional_plan");
    if (signals.data.age === "out_of_scope") active.push("age_out_of_scope");
    if (signals.data.facts === "conflicting") active.push("facts_conflicting");
    if (active.length > 0) return professional(context, requestScope, active);

    const missing: string[] = [];
    if (signals.data.reaction === "unknown") missing.push("reaction");
    if (signals.data.swallowing === "unknown") missing.push("swallowing");
    if (signals.data.growthOrCondition === "unknown") missing.push("growth_or_condition");
    if (signals.data.specialDiet === "unknown") missing.push("special_diet");
    if (signals.data.professionalPlan === "unknown") missing.push("professional_plan");
    if (signals.data.age === "unknown") missing.push("age");
    if (signals.data.facts === "missing") missing.push("facts");
    if (missing.length > 0) return insufficient(context, ["clinical_facts_missing"], missing);

    if (!context.content.ok) return insufficient(context, ["content_unavailable"]);
    if (context.composition.status !== "composed") {
      return context.composition.reasonCode === "REVIEW_REQUIRED"
        ? professional(context, requestScope, ["composition_review_required"])
        : insufficient(context, [context.composition.reasonCode.toLocaleLowerCase("en-US")]);
    }
    if (!validComposition(context.composition) || !validContent(context.content, requestScope, context.composition)) {
      return insufficient(context, ["content_or_composition_invalid"]);
    }

    const exclusionReasons = sorted(context.composition.exclusions.flatMap((item) => item.reasonCodes));
    const reviewExclusions = exclusionReasons.filter((reason) => professionalExclusions.has(reason));
    if (reviewExclusions.length > 0) return professional(context, requestScope, reviewExclusions);
    if (exclusionReasons.some((reason) => incompleteExclusions.has(reason))) {
      return insufficient(context, ["eligibility_information_incomplete"], exclusionReasons.filter((reason) => incompleteExclusions.has(reason)));
    }

    if (!validTexture(context.texture, context.composition)) return insufficient(context, ["texture_evidence_invalid"]);
    if (context.texture.disposition.status === "excluded") return insufficient(context, ["texture_excluded"]);
    if (context.texture.disposition.status === "review_required") {
      return professional(context, requestScope, context.texture.disposition.reasonCodes);
    }

    const visibleText = context.composition.recipes.flatMap((recipe) => [
      recipe.title,
      ...recipe.preparationSteps,
      ...recipe.guidance.flatMap((block) => [block.title, block.text]),
    ]).concat(context.texture.disposition.approvedText.map((item) => item.text)).join("\n");
    const responseCheck = createClinicalResponsePolicy().validateGeneratedResponse({
      kind: "educational",
      text: visibleText,
      sourceIds: [],
    }, requestScope.countryOfCare === "CO" ? "es-CO" : "en-US");
    if (!responseCheck.ok) return professional(context, requestScope, ["content_policy_blocked"]);

    const reasons = [context.texture.disposition.status];
    return deepFreeze({
      status: "educational_guidance",
      responseMode: "educational",
      composition: context.composition,
      texture: context.texture.disposition,
      provenance: provenance(context, "educational_guidance", reasons),
    });
  } catch {
    return insufficient(context, ["internal_error"], [], false);
  }
}
