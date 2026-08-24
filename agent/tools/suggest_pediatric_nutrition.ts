import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../lib/access/authorized-child-scope";
import { resolveTrustedToolContextForEve } from "../lib/runtime/eve-tool-context";
import { mapToolError } from "../lib/runtime/safe-tool-errors";
import {
  createCitationHandle,
  projectToolResult,
  type ToolSafeProjectionMap,
} from "../lib/runtime/safe-to-model";
import { withToolAudit } from "../lib/runtime/tool-audit";
import { withToolIdempotency } from "../lib/runtime/tool-idempotency";
import {
  getTrustedToolAbortSignal,
  getTrustedToolLocale,
  getTrustedToolServices,
  type ToolServicePorts,
  type TrustedToolContext,
} from "../lib/runtime/trusted-tool-context";
import type {
  FoodReactionQuerySuccess,
} from "../../src/application/nutrition/food-reaction-query";
import type {
  NutritionProfileQuerySuccess,
} from "../../src/application/nutrition/nutrition-profile-query";
import {
  applyNutritionAbstention,
  type NutritionAbstentionResult,
} from "../../src/clinical/nutrition/abstention";
import {
  composeNutritionGuidance,
  type NutritionCompositionResult,
} from "../../src/clinical/nutrition/composer";
import {
  loadNutritionContent,
  type NutritionContentResolution,
} from "../../src/clinical/nutrition/content-loader";
import {
  foodRestrictionSchema,
  nutritionAgeEvidenceSchema,
  nutritionReadinessEvidenceSchema,
  nutritionEligibilitySchema,
  type FoodRestriction,
  type NutritionEligibility,
  type NutritionReadinessEvidence,
} from "../../src/clinical/nutrition/types";
import type { TextureSafetyResult } from "../../src/clinical/nutrition/texture-policy";
import type { Sha256Hex } from "../../src/clinical/governance/source-types";
import type { SafetyDecision } from "../../src/safety/message-types";

const TOOL_ID = "suggest_pediatric_nutrition" as const;
const TOOL_SCHEMA_VERSION = "suggest-pediatric-nutrition.v1" as const;
const MAX_RECIPES = 1;
const DEFAULT_SEED = "default";
const HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const CODE = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const CONTROL_CHARACTER = /[\p{Cc}\p{Cf}]/u;
const MARKUP_CHARACTER = /[<>`]/u;
const EXECUTABLE_OR_ROLE = /(?:\b(?:https?|s3|gs|file|javascript|data)\s*:(?:\/\/?)*|\bon[a-z][a-z0-9_-]*\s*(?:=|:)|\[(?:\/?)(?:system|assistant|developer|tool|function)\]|\b(?:system|assistant|developer|tool|function)\s*:|\b(?:role|prompt)\s*[:=]\s*(?:system|assistant|developer|tool|function)?\b|\b(?:system|assistant|developer|tool|function)\s+(?:role|prompt|message)\b)/iu;
const INSTRUCTION_OVERRIDE = /\b(?:ignore|forget|disregard|override|bypass|reveal|expose|show)\b.{0,80}\b(?:previous|prior|system|developer|assistant|instruction|prompt|policy|child|record|secret)\b/iu;

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isSafeBoundaryText(value: string): boolean {
  return value === value.normalize("NFKC")
    && value.trim().length > 0
    && !CONTROL_CHARACTER.test(value)
    && !MARKUP_CHARACTER.test(value)
    && !EXECUTABLE_OR_ROLE.test(value)
    && !INSTRUCTION_OVERRIDE.test(value);
}

const TEXT = z.string().min(1).max(4_000).refine(isSafeBoundaryText, "safe approved text");
const LICENSE = z.string().min(1).max(256).refine(isSafeBoundaryText, "safe bounded license");
const CITATION_HANDLE = z.string().regex(/^citation:v1:[a-f0-9]{64}$/u);
const LOCALE = z.enum(["es-CO", "en-US"]);
const APPROACH = z.enum([
  "breastfeeding",
  "formula",
  "mixed",
  "traditional_complementary",
  "blw",
  "mixed_complementary",
  "family_food",
]);
const THEME = z.enum([
  "complementary_feeding",
  "family_food",
  "preparation",
  "texture",
  "responsive_feeding",
]);
const PREFERENCE = z.enum(["family_food", "traditional", "variety", "vegetarian"]);

/** Only display preferences are model supplied. Child, country, age, package,
 * authority, entitlement, and clinical-result fields are deliberately absent. */
export const SUGGEST_PEDIATRIC_NUTRITION_INPUT_SCHEMA = z.object({
  theme: THEME.optional(),
  approach: APPROACH.optional(),
  preferences: z.array(PREFERENCE).max(4).optional(),
  maxRecipes: z.number().int().min(1).max(MAX_RECIPES).optional(),
  seed: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u).optional(),
}).strict();
export type SuggestPediatricNutritionInput = z.infer<typeof SUGGEST_PEDIATRIC_NUTRITION_INPUT_SCHEMA>;

const TEXTURE_TRANSFORMATION = z.object({
  formCode: CODE,
  shapeCode: CODE,
  sizeCode: CODE,
  textureCode: CODE,
}).strict();

const TRUSTED_CITATION = z.object({
  sourceId: CODE,
  sourceVersion: CODE,
  license: LICENSE,
  citationHandle: CITATION_HANDLE,
}).strict();

const TRUSTED_PROVENANCE = z.object({
  packageId: CODE,
  packageVersion: CODE,
  algorithmId: CODE,
  algorithmVersion: CODE,
  jurisdiction: z.enum(["CO", "US"]),
  locale: LOCALE,
  contentStatus: z.literal("released_approved"),
  rightsStatus: z.literal("verified"),
  citations: z.array(TRUSTED_CITATION).max(16),
}).strict();

const TRUSTED_BLOCK = z.object({
  contentId: CODE,
  kind: z.enum(["education", "feeding", "preparation", "safety", "exclusion"]),
  title: TEXT.max(160),
  text: TEXT,
  tags: z.array(CODE).max(50),
  citations: z.array(TRUSTED_CITATION).max(16),
  citationHandles: z.array(CITATION_HANDLE).min(1).max(16),
}).strict();

const TRUSTED_SUBSTITUTION = z.object({
  kind: z.literal("whole_recipe"),
  recipeId: CODE,
  title: TEXT.max(160),
  ingredientCodes: z.array(CODE).min(1).max(24),
}).strict();

const TRUSTED_TRANSFORMATION = z.object({
  ingredientCode: CODE,
  from: TEXTURE_TRANSFORMATION,
  to: TEXTURE_TRANSFORMATION,
  approvedBlockId: CODE,
}).strict();

const TEXTURE_RESULT_SCHEMA = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    disposition: z.object({
      status: z.enum(["allowed", "transform_required", "excluded", "review_required"]),
      recipeId: CODE,
      reasonCodes: z.array(CODE).min(1).max(24),
      approvedText: z.array(z.object({ blockId: CODE, text: TEXT }).strict()).min(1).max(16),
      transformations: z.array(TRUSTED_TRANSFORMATION).max(24),
      provenance: z.object({
        packageId: CODE,
        packageVersion: CODE,
        artifactSha256: HASH,
        sourceDigests: z.array(HASH).min(1).max(16),
        algorithmId: z.literal("texture-safety"),
        algorithmVersion: z.literal("texture-safety.v1"),
        inputDigest: HASH,
        decisionDigest: HASH,
      }).strict(),
    }).strict(),
  }).strict(),
  z.object({
    ok: z.literal(false),
    reasonCode: z.enum(["NOT_AUTHORIZED", "INVALID_REQUEST", "COMPOSITION_INVALID", "RULE_PACK_UNAVAILABLE", "INTERNAL_ERROR"]),
  }).strict(),
]);

const TRUSTED_RECIPE = z.object({
  recipeId: CODE,
  title: TEXT.max(160),
  ingredientCodes: z.array(CODE).min(1).max(24),
  preparationSteps: z.array(TEXT.max(500)).min(1).max(12),
  texture: z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]),
  supervision: z.enum(["required", "recommended"]),
  guidance: z.array(TRUSTED_BLOCK).max(16),
  allowedSubstitutions: z.array(TRUSTED_SUBSTITUTION).max(8),
  transformations: z.array(TRUSTED_TRANSFORMATION).max(24),
  approvedTextureText: z.array(z.object({ blockId: CODE, text: TEXT }).strict()).max(16),
  citations: z.array(TRUSTED_CITATION).max(16),
  citationHandles: z.array(CITATION_HANDLE).min(1).max(16),
}).strict();

const TRUSTED_ABSTENTION_PROVENANCE = z.object({
  algorithmId: CODE,
  algorithmVersion: CODE,
  decisionStatus: z.enum(["insufficient_data", "professional_review"]),
  locale: LOCALE,
}).strict();

const AGE_DISPOSITION = z.object({
  status: z.enum(["in_scope", "out_of_scope", "unknown"]),
  algorithmId: z.literal("nutrition-age-disposition"),
  algorithmVersion: z.literal("nutrition-age-disposition.v1"),
  cutoffAt: z.string().datetime({ offset: true }),
  ageDigest: HASH,
}).strict();

const TRUSTED_DATA = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("educational_guidance"),
    responseMode: z.literal("educational"),
    blocks: z.array(TRUSTED_BLOCK).max(16),
    recipes: z.array(TRUSTED_RECIPE).max(1),
    exclusions: z.array(z.object({ contentId: CODE, reasonCodes: z.array(CODE).min(1).max(8) }).strict()).max(24),
    provenance: TRUSTED_PROVENANCE,
  }).strict(),
  z.object({
    status: z.literal("insufficient_data"),
    responseMode: z.literal("insufficient_data"),
    reasonCodes: z.array(CODE).min(1).max(8),
    missingFacts: z.array(CODE).max(8),
    provenance: TRUSTED_ABSTENTION_PROVENANCE.nullable(),
  }).strict(),
  z.object({
    status: z.literal("professional_review"),
    responseMode: z.literal("pediatrician_recommendation"),
    reasonCodes: z.array(CODE).min(1).max(8),
    recommendation: z.object({
      type: z.literal("pediatrician_recommendation"),
      text: TEXT.max(512),
      locale: LOCALE,
      messageId: CODE,
    }).strict(),
    provenance: TRUSTED_ABSTENTION_PROVENANCE,
  }).strict(),
]);

export const SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA = z.object({
  kind: z.literal("trusted_tool_result"),
  toolId: z.literal(TOOL_ID),
  schemaVersion: z.literal(`${TOOL_ID}.trusted.v1`),
  data: TRUSTED_DATA,
}).strict();
export type SuggestPediatricNutritionTrustedResult = Readonly<z.infer<typeof SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA>>;

export const SUGGEST_PEDIATRIC_NUTRITION_OUTPUT_SCHEMA = z.object({
  status: z.literal("succeeded"),
  outcome: z.literal("no_effect"),
  result: SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA,
  idempotencyKey: z.null(),
  requestSha256: HASH,
  approvalSha256: z.null(),
}).strict();
type SuggestPediatricNutritionExecution = z.infer<typeof SUGGEST_PEDIATRIC_NUTRITION_OUTPUT_SCHEMA>;

const SAFETY_DECISION = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("urgent"), responseMode: z.literal("emergency_recommendation"), ruleCodes: z.array(CODE).min(1).max(64), copyKey: z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]) }).strict(),
  z.object({ decision: z.literal("clarification_required"), responseMode: z.literal("clarify"), question: CODE }).strict(),
  z.object({ decision: z.literal("professional_review"), responseMode: z.literal("pediatrician_recommendation"), reasonCode: CODE }).strict(),
  z.object({ decision: z.literal("not_urgent"), responseMode: z.literal("continue") }).strict(),
  z.object({ decision: z.literal("indeterminate"), responseMode: z.literal("abstain"), reasonCode: CODE }).strict(),
]);

const CONCERN = z.enum(["none", "active", "unknown"]);
const CONCERNS = z.object({
  swallowing: CONCERN,
  poorGrowthOrCondition: CONCERN,
  specialDiet: CONCERN,
}).strict();
const SNAPSHOT_KEYS = [
  "revalidatedScope", "profile", "reactions", "readiness", "ageDisposition", "restrictions", "concerns",
  "professionalPlan", "swallowingAbility", "safetyDecision", "content", "eligibility", "composition", "texture",
].sort().join("|");

export type NutritionGuidanceSnapshotRequest = Readonly<{
  scope: AuthorizedChildScope;
  locale: "es-CO" | "en-US";
  cutoffAt: string;
  input: SuggestPediatricNutritionInput;
  signal: AbortSignal;
}>;

export type NutritionGuidanceSnapshot = Readonly<{
  /** The adapter rechecks revocation/ownership before returning this snapshot. */
  revalidatedScope: AuthorizedChildScope | null;
  profile: NutritionProfileQuerySuccess;
  reactions: FoodReactionQuerySuccess;
  readiness: NutritionReadinessEvidence;
  /** Versioned server decision; the presenter never computes an age boundary. */
  ageDisposition: Readonly<z.infer<typeof AGE_DISPOSITION>>;
  restrictions: readonly FoodRestriction[];
  concerns: Readonly<{
    swallowing: "none" | "active" | "unknown";
    poorGrowthOrCondition: "none" | "active" | "unknown";
    specialDiet: "none" | "active" | "unknown";
  }>;
  professionalPlan: "none" | "active" | "unknown";
  swallowingAbility: "adequate" | "concern" | "unknown";
  safetyDecision: SafetyDecision;
  content: NutritionContentResolution;
  eligibility: readonly NutritionEligibility[];
  composition: NutritionCompositionResult;
  texture: TextureSafetyResult;
}>;

export interface NutritionGuidanceSnapshotPort {
  resolve(request: NutritionGuidanceSnapshotRequest): Promise<NutritionGuidanceSnapshot>;
}

type NutritionGuidanceServices = Readonly<ToolServicePorts & {
  nutritionGuidance: NutritionGuidanceSnapshotPort;
}>;

const IDEMPOTENCY_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
  inputSchema: SUGGEST_PEDIATRIC_NUTRITION_INPUT_SCHEMA,
  resultSchema: SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA,
});

const AUDIT_DEFINITION = Object.freeze({
  toolId: TOOL_ID,
  schemaVersion: TOOL_SCHEMA_VERSION,
  effect: "read_only" as const,
  operation: "no_effect",
});

function safeFailure(code: string): never {
  const sourceCode = code === "CLINICAL_POLICY_UNAVAILABLE" ? "POLICY_UNAVAILABLE" : code;
  throw mapToolError(Object.freeze({ code: sourceCode }), { effectState: "none" });
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function ownKeys(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return Object.keys(value).sort().join("|");
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) safeFailure("CANCELLED");
}

function validScope(
  requestScope: AuthorizedChildScope,
  revalidatedScope: AuthorizedChildScope | null,
  cutoff: Date,
): revalidatedScope is AuthorizedChildScope {
  return revalidatedScope !== null
    && hasPermission(requestScope, "read", cutoff)
    && hasPermission(revalidatedScope, "read", cutoff)
    && sameAuthorizedChildScope(requestScope, revalidatedScope)
    && requestScope.countryOfCare === revalidatedScope.countryOfCare
    && requestScope.timezone === revalidatedScope.timezone
    && revalidatedScope.permissions.every((permission) => requestScope.permissions.includes(permission));
}

function validProfile(
  value: unknown,
  cutoffAt: string,
  scope: AuthorizedChildScope,
): value is NutritionProfileQuerySuccess {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ownKeys(value) !== "age|completeness|digest|ok|professionalPlan|profile|status") return false;
  const profileResult = value as NutritionProfileQuerySuccess;
  if (profileResult.ok !== true || profileResult.status !== "available" || profileResult.professionalPlan !== "unknown"
    || !HASH.safeParse(profileResult.digest).success
    || !nutritionAgeEvidenceSchema.safeParse(profileResult.age).success
    || profileResult.age.referenceInstant !== cutoffAt
    || profileResult.age.timeZone !== scope.timezone
    || !Number.isSafeInteger(profileResult.age.ageDays)
    || profileResult.age.ageDays < 0
    || profileResult.age.ageDays > 18 * 366) return false;
  const profileValue = profileResult.profile;
  if (!profileValue || typeof profileValue !== "object" || Array.isArray(profileValue)
    || ownKeys(profileValue) !== "exclusions|feedingApproach|source|textureStage"
    || !Array.isArray(profileValue.exclusions)
    || !profileValue.exclusions.every((item) => typeof item === "string" && CODE.safeParse(item).success)
    || (profileValue.feedingApproach !== null && !APPROACH.safeParse(profileValue.feedingApproach).success)
    || (profileValue.textureStage !== null && !z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]).safeParse(profileValue.textureStage).success)
    || !profileValue.source || typeof profileValue.source !== "object"
    || ownKeys(profileValue.source) !== "createdAt|sourceId|updatedAt") return false;
  const completeness = {
    age: "complete",
    feedingApproach: profileValue.feedingApproach === null ? "missing" : "complete",
    textureStage: profileValue.textureStage === null ? "missing" : "complete",
    exclusions: "complete",
    professionalPlan: "unknown",
  } as const;
  if (canonicalize(profileResult.completeness) !== canonicalize(completeness)) return false;
  return profileResult.digest === hash({
    algorithmVersion: "nutrition-profile-query.v1",
    cutoff: cutoffAt,
    age: profileResult.age,
    profile: profileResult.profile,
    professionalPlan: profileResult.professionalPlan,
    completeness: profileResult.completeness,
  });
}

function validAgeDisposition(
  value: unknown,
  profile: NutritionProfileQuerySuccess,
  cutoffAt: string,
): value is NutritionGuidanceSnapshot["ageDisposition"] {
  const parsed = AGE_DISPOSITION.safeParse(value);
  if (!parsed.success || parsed.data.cutoffAt !== cutoffAt) return false;
  return parsed.data.ageDigest === hash({
    algorithmId: parsed.data.algorithmId,
    algorithmVersion: parsed.data.algorithmVersion,
    cutoffAt,
    age: profile.age,
    status: parsed.data.status,
  });
}

const REACTION_SCHEMA = z.object({
  identity: z.object({ id: CODE, foodLabel: TEXT.max(500), foodCode: CODE.nullable(), mapping: z.enum(["normalized", "unmapped"]) }).strict(),
  declaration: z.object({ reactionType: z.enum(["allergy", "intolerance", "preference", "avoidance"]), severity: z.enum(["mild", "moderate", "severe", "unknown"]).nullable(), status: z.enum(["declared", "confirmed", "resolved", "entered_in_error"]), lifecycle: z.enum(["active", "resolved", "entered_in_error"]) }).strict(),
  confirmation: z.object({ status: z.enum(["declared", "confirmed", "unknown"]) }).strict(),
  supersession: z.literal("unknown"),
  uncertainty: z.array(z.enum(["unmapped_food", "supersession_unavailable", "confirmation_uncertain", "duplicate_identity", "conflicting_evidence"])).max(8),
  provenance: z.object({ provenanceType: z.enum(["guardian", "professional", "import", "document", "chat"]), observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable(), createdAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }) }).strict(),
}).strict();

function validReactions(value: unknown, cutoffAt: string): value is FoodReactionQuerySuccess {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ownKeys(value) !== "digest|ok|reactions|status") return false;
  const result = value as FoodReactionQuerySuccess;
  if (result.ok !== true || result.status !== "available" || !HASH.safeParse(result.digest).success
    || !Array.isArray(result.reactions) || result.reactions.length > 100
    || !result.reactions.every((reaction) => REACTION_SCHEMA.safeParse(reaction).success)) return false;
  return result.digest === hash({
    algorithmVersion: "food-reaction-query.v1",
    cutoff: cutoffAt,
    reactions: result.reactions,
  });
}

function validContent(
  value: unknown,
  scope: AuthorizedChildScope,
  cutoff: Date,
  locale: "es-CO" | "en-US",
): value is NutritionContentResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const content = value as NutritionContentResolution;
  if (!content.ok) return content.code === "NUTRITION_CONTENT_UNAVAILABLE"
    && typeof content.reason === "string"
    && content.reason.length > 0
    && content.reason.length <= 128
    && HASH.safeParse(content.digest).success;
  try {
    const manifest = content.value.manifest;
    if (manifest.jurisdiction !== scope.countryOfCare || manifest.locale !== locale) return false;
    const fresh = loadNutritionContent({
      countryOfCare: scope.countryOfCare,
      locale,
      asOf: cutoff,
      timeZone: scope.timezone,
    }, [manifest]);
    return fresh.ok && canonicalize(fresh.value) === canonicalize(content.value);
  } catch {
    return false;
  }
}

function validTexture(
  value: unknown,
  composition: NutritionCompositionResult,
): value is TextureSafetyResult {
  const parsed = TEXTURE_RESULT_SCHEMA.safeParse(value);
  if (!parsed.success) return false;
  if (!parsed.data.ok) return true;
  if (composition.status !== "composed") return false;
  const { disposition } = parsed.data;
  const { decisionDigest, ...provenance } = disposition.provenance;
  const transformationsExpected = disposition.status === "transform_required";
  return disposition.reasonCodes.every((code, index) => index === 0 || disposition.reasonCodes[index - 1]! < code)
    && disposition.approvedText.every((item, index) => index === 0 || disposition.approvedText[index - 1]!.blockId < item.blockId)
    && disposition.transformations.every((item, index) => index === 0 || disposition.transformations[index - 1]!.ingredientCode < item.ingredientCode)
    && disposition.provenance.sourceDigests.every((digest, index) => index === 0 || disposition.provenance.sourceDigests[index - 1]! < digest)
    && (transformationsExpected ? disposition.transformations.length > 0 : disposition.transformations.length === 0)
    && exactStringArray(disposition.provenance.sourceDigests, composition.provenance.sourceDigests)
    && decisionDigest === hash({
      status: disposition.status,
      recipeId: disposition.recipeId,
      reasonCodes: disposition.reasonCodes,
      approvedText: disposition.approvedText,
      transformations: disposition.transformations,
      provenance,
    });
}

function reactionSignal(reactions: FoodReactionQuerySuccess): "none" | "active" | "unknown" {
  if (reactions.reactions.length === 0) return "none";
  if (reactions.reactions.some((reaction) => reaction.declaration.lifecycle === "active"
    && ["declared", "confirmed"].includes(reaction.declaration.status))) return "active";
  if (reactions.reactions.some((reaction) => reaction.declaration.lifecycle !== "resolved"
    && reaction.declaration.lifecycle !== "entered_in_error")) return "unknown";
  return "none";
}

function restrictionSignal(restrictions: readonly FoodRestriction[]): "none" | "active" | "unknown" {
  if (restrictions.some((restriction) => restriction.kind === "unknown" || restriction.state === "unknown")) return "unknown";
  if (restrictions.some((restriction) => ["allergy", "intolerance", "reaction"].includes(restriction.kind)
    && ["declared", "confirmed"].includes(restriction.state))) return "active";
  return "none";
}

function boundedCitation(
  source: Readonly<{ sourceId: string; sourceVersion: string; artifactSha256: Sha256Hex; license: string }>,
): z.infer<typeof TRUSTED_CITATION> {
  return {
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    license: source.license,
    citationHandle: createCitationHandle(TOOL_ID, {
      sourceDigest: source.artifactSha256,
      referenceCode: source.sourceId,
    }),
  };
}

function sourceCitations(
  content: Extract<NutritionContentResolution, { ok: true }>,
): z.infer<typeof TRUSTED_CITATION>[] {
  const byKey = new Map<string, z.infer<typeof TRUSTED_CITATION>>();
  for (const source of content.value.manifest.sources) {
    const citation = boundedCitation(source);
    byKey.set(`${citation.sourceId}:${citation.sourceVersion}:${citation.license}:${source.artifactSha256}`, citation);
  }
  return [...byKey.values()].sort((left, right) => compareAscii(left.sourceId, right.sourceId)
    || compareAscii(left.sourceVersion, right.sourceVersion)
    || compareAscii(left.license, right.license)
    || compareAscii(left.citationHandle, right.citationHandle));
}

function boundedProvenance(
  content: Extract<NutritionContentResolution, { ok: true }>,
  locale: "es-CO" | "en-US",
  decisionStatus: "educational_guidance" | "insufficient_data" | "professional_review",
): z.infer<typeof TRUSTED_PROVENANCE> | z.infer<typeof TRUSTED_ABSTENTION_PROVENANCE> {
  const citations = sourceCitations(content);
  if (decisionStatus === "educational_guidance") return {
    packageId: content.value.packageId,
    packageVersion: content.value.packageVersion,
    algorithmId: "nutrition-guidance",
    algorithmVersion: "nutrition-guidance.v1",
    jurisdiction: content.value.manifest.jurisdiction,
    locale,
    contentStatus: "released_approved",
    rightsStatus: "verified",
    citations,
  };
  return {
    algorithmId: "nutrition-abstention",
    algorithmVersion: "nutrition-abstention.v1",
    decisionStatus,
    locale,
  };
}

function citationKey(value: Readonly<{
  sourceId: string;
  sourceVersion: string;
  artifactSha256: string;
  license: string;
}>): string {
  return [value.sourceId, value.sourceVersion, value.artifactSha256, value.license].join("\u0000");
}

function exactCitationSet(
  actual: readonly Readonly<{
    sourceId: string;
    sourceUri: string;
    sourceVersion: string;
    artifactSha256: Sha256Hex;
    license: string;
  }>[],
  approved: readonly Readonly<{
    sourceId: string;
    sourceUri: string;
    sourceVersion: string;
    artifactSha256: Sha256Hex;
    license: string;
  }>[],
): boolean {
  const actualKeys = [...new Set(actual.map(citationKey))].sort(compareAscii);
  const approvedKeys = [...new Set(approved.map(citationKey))].sort(compareAscii);
  return actualKeys.length === approvedKeys.length
    && actualKeys.every((value, index) => value === approvedKeys[index]);
}

function exactStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function orderedCodes(values: readonly string[]): boolean {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || values[index - 1]! < value);
}

function validEligibility(value: unknown, content: NutritionContentResolution): boolean {
  if (!Array.isArray(value) || value.length > 200 || !value.every((item) => nutritionEligibilitySchema.safeParse(item).success)) return false;
  if (!content.ok) return value.length === 0;
  const parsedDecisions = value.map((item) => nutritionEligibilitySchema.safeParse(item));
  const ids = parsedDecisions.flatMap((parsed) => parsed.success ? [parsed.data.contentId] : []);
  if (new Set(ids).size !== ids.length) return false;
  const contentTypes = new Map<string, "block" | "recipe">();
  for (const block of content.value.blocks) contentTypes.set(block.id, "block");
  for (const recipe of content.value.recipes) contentTypes.set(recipe.id, "recipe");
  return value.every((item) => {
    const parsed = nutritionEligibilitySchema.safeParse(item);
    if (!parsed.success) return false;
    const decision = parsed.data;
    if (contentTypes.get(decision.contentId) !== decision.contentType
      || decision.provenance.packageId !== content.value.packageId
      || decision.provenance.packageVersion !== content.value.packageVersion
      || decision.provenance.artifactSha256 !== content.value.artifactSha256
      || decision.provenance.algorithmId !== "nutrition-eligibility"
      || decision.provenance.algorithmVersion !== "nutrition-eligibility.v1"
      || !exactStringArray([...decision.provenance.sourceDigests].sort(compareAscii), [...content.value.sourceDigests].sort(compareAscii))
      || !orderedCodes(decision.matchedTags)
      || !orderedCodes(decision.reasonCodes)
      || !orderedCodes(decision.missingFacts)) return false;
    const { decisionDigest: _decisionDigest, ...provenance } = decision.provenance;
    return hash({
      status: decision.status,
      tags: decision.matchedTags,
      reasonCodes: decision.reasonCodes,
      missingFacts: decision.missingFacts,
      provenance,
    }) === decision.provenance.decisionDigest;
  });
}

function validCompositionForRequest(
  value: NutritionCompositionResult,
  scope: AuthorizedChildScope,
  input: SuggestPediatricNutritionInput,
  cutoff: Date,
  snapshot: NutritionGuidanceSnapshot,
): boolean {
  try {
    const expected = composeNutritionGuidance(scope, {
      seed: input.seed ?? DEFAULT_SEED,
      maxRecipes: input.maxRecipes ?? MAX_RECIPES,
    }, {
      cutoff,
      revalidatedScope: snapshot.revalidatedScope,
      content: snapshot.content,
      eligibility: snapshot.eligibility,
    });
    return canonicalize(expected) === canonicalize(value);
  } catch {
    return false;
  }
}

function validApprovedComposition(
  composition: Extract<NutritionCompositionResult, { status: "composed" }>,
  content: Extract<NutritionContentResolution, { ok: true }>,
  texture: Extract<TextureSafetyResult, { ok: true }>,
): boolean {
  if (composition.recipes.length !== 1) return false;
  const recipesById = new Map(content.value.recipes.map((recipe) => [recipe.id, recipe]));
  const blocksById = new Map(content.value.blocks.map((block) => [block.id, block]));
  const selectedIds: string[] = [];
  for (const recipe of composition.recipes) {
    const approvedRecipe = recipesById.get(recipe.id);
    if (!approvedRecipe
      || recipe.title !== approvedRecipe.title
      || !exactStringArray(recipe.ingredientCodes, approvedRecipe.ingredientCodes)
      || !exactStringArray(recipe.preparationSteps, approvedRecipe.preparationSteps)
      || recipe.texture !== approvedRecipe.texture
      || recipe.supervision !== approvedRecipe.supervision
      || recipe.guidance.length !== approvedRecipe.guidanceBlockIds.length
      || !recipe.guidance.every((block, index) => {
        const expectedId = approvedRecipe.guidanceBlockIds[index];
        const approvedBlock = expectedId === undefined ? undefined : blocksById.get(expectedId);
        return approvedBlock !== undefined
          && block.id === approvedBlock.id
          && block.title === approvedBlock.title
          && block.text === approvedBlock.text
          && exactStringArray(block.tags, approvedBlock.tags);
      })
      || !exactCitationSet(recipe.citations, [
        ...approvedRecipe.provenance.sources,
        ...approvedRecipe.guidanceBlockIds.flatMap((id) => blocksById.get(id)?.provenance.sources ?? []),
      ])) return false;
    selectedIds.push(recipe.id, ...recipe.guidance.map((block) => block.id));
    for (const alternative of recipe.allowedSubstitutions) {
      const approvedAlternative = recipesById.get(alternative.recipeId);
      if (!approvedAlternative
        || alternative.title !== approvedAlternative.title
        || !exactStringArray(alternative.ingredientCodes, approvedAlternative.ingredientCodes)) return false;
    }
  }
  const approvedIds = [...new Set(selectedIds)].sort(compareAscii);
  const actualIds = [...new Set(composition.approvedContentIds)].sort(compareAscii);
  if (!exactStringArray(actualIds, approvedIds)) return false;

  const recipeIds = new Set(composition.recipes.map((recipe) => recipe.id));
  if (!composition.exclusions.every((item) => !recipeIds.has(item.contentId) && recipesById.has(item.contentId))) return false;
  if (texture.disposition.recipeId !== undefined && !recipeIds.has(texture.disposition.recipeId)) return false;
  const textureRecipe = composition.recipes.find((recipe) => recipe.id === texture.disposition.recipeId);
  if (!textureRecipe) return false;
  const guidanceText = new Map(textureRecipe.guidance.map((block) => [block.id, block.text]));
  if (!texture.disposition.approvedText.every((item) => guidanceText.get(item.blockId) === item.text)) return false;
  return texture.disposition.transformations.every((item) => textureRecipe.ingredientCodes.includes(item.ingredientCode)
    && guidanceText.has(item.approvedBlockId));
}

function respectsProfileExclusions(
  composition: NutritionCompositionResult,
  profile: NutritionProfileQuerySuccess,
): boolean {
  if (composition.status !== "composed") return true;
  const exclusions = new Set(profile.profile.exclusions.map((value) => value.toLocaleLowerCase("en-US")));
  return composition.recipes.every((recipe) => [
    recipe.id,
    ...recipe.ingredientCodes,
    ...recipe.guidance.flatMap((block) => [block.id, ...block.tags]),
    ...recipe.allowedSubstitutions.flatMap((alternative) => [alternative.recipeId, ...alternative.ingredientCodes]),
  ].every((value) => !exclusions.has(value.toLocaleLowerCase("en-US"))));
}

function finalizeTrusted(
  raw: unknown,
  snapshot: NutritionGuidanceSnapshot,
  scope: AuthorizedChildScope,
): SuggestPediatricNutritionTrustedResult {
  const parsed = SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  let serialized: string;
  try {
    serialized = JSON.stringify(parsed.data);
  } catch {
    return safeFailure("PERSISTENCE_UNAVAILABLE");
  }
  const forbiddenIdentifiers = [scope.actorUserId, scope.careSpaceId, scope.childId];
  const contentDigests = snapshot.content.ok
    ? [
      snapshot.content.value.artifactSha256,
      snapshot.content.value.sourceDigest,
      ...snapshot.content.value.sourceDigests,
      snapshot.content.value.licenseDigest,
      snapshot.content.value.rightsDigest,
      snapshot.content.value.approvalDigest,
      ...snapshot.content.value.manifest.sources.map((source) => source.artifactSha256),
    ]
    : [];
  const serializedFolded = serialized.toLowerCase();
  if ([...forbiddenIdentifiers, ...contentDigests].some((value) => value.length > 0
    && serializedFolded.includes(value.toLowerCase()))) {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  }
  return parsed.data as SuggestPediatricNutritionTrustedResult;
}

function trustedFromDomain(
  value: NutritionAbstentionResult,
  snapshot: NutritionGuidanceSnapshot,
  scope: AuthorizedChildScope,
  locale: "es-CO" | "en-US",
): SuggestPediatricNutritionTrustedResult {
  if (value.status === "emergency_only") return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  if (value.status === "insufficient_data") {
    const content = snapshot.content.ok ? snapshot.content : null;
    return finalizeTrusted({
      kind: "trusted_tool_result",
      toolId: TOOL_ID,
      schemaVersion: `${TOOL_ID}.trusted.v1`,
      data: {
        status: "insufficient_data",
        responseMode: "insufficient_data",
        reasonCodes: [...value.reasonCodes],
        missingFacts: [...value.missingFacts],
        provenance: value.provenance && content ? boundedProvenance(content, locale, "insufficient_data") : null,
      },
    }, snapshot, scope);
  }
  if (value.status === "professional_review") {
    const content = snapshot.content.ok ? snapshot.content : null;
    if (!content || value.recommendation.locale !== locale || value.recommendation.type !== "pediatrician_recommendation") {
      return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    }
    return finalizeTrusted({
      kind: "trusted_tool_result",
      toolId: TOOL_ID,
      schemaVersion: `${TOOL_ID}.trusted.v1`,
      data: {
        status: "professional_review",
        responseMode: "pediatrician_recommendation",
        reasonCodes: [...value.reasonCodes],
        recommendation: value.recommendation,
        provenance: boundedProvenance(content, locale, "professional_review"),
      },
    }, snapshot, scope);
  }

  if (!snapshot.content.ok || value.composition.status !== "composed" || !snapshot.texture.ok
    || !validApprovedComposition(value.composition, snapshot.content, snapshot.texture)) {
    return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
  }
  const contentBlocks = new Map(snapshot.content.value.blocks.map((block) => [block.id, block]));
  const recipes = value.composition.recipes.map((recipe) => {
    const guidance = recipe.guidance.map((block) => {
      const approved = contentBlocks.get(block.id);
      if (!approved || approved.title !== block.title || approved.text !== block.text) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
      const blockCitations = approved.provenance.sources.map((source) => boundedCitation(source));
      return {
        contentId: approved.id,
        kind: approved.kind,
        title: approved.title,
        text: approved.text,
        tags: [...approved.tags],
        citations: blockCitations,
        citationHandles: blockCitations.map((citation) => citation.citationHandle),
      };
    });
    const recipeCitations = recipe.citations.map((citation) => boundedCitation(citation));
    const textureDisposition = snapshot.texture.ok && snapshot.texture.disposition.recipeId === recipe.id
      ? snapshot.texture.disposition
      : null;
    return {
      recipeId: recipe.id,
      title: recipe.title,
      ingredientCodes: [...recipe.ingredientCodes],
      preparationSteps: [...recipe.preparationSteps],
      texture: recipe.texture,
      supervision: recipe.supervision,
      guidance,
      allowedSubstitutions: recipe.allowedSubstitutions.map((alternative) => ({ ...alternative, ingredientCodes: [...alternative.ingredientCodes] })),
      transformations: textureDisposition?.transformations.map((item) => ({ ...item })) ?? [],
      approvedTextureText: textureDisposition?.approvedText.map((item) => ({ ...item })) ?? [],
      citations: recipeCitations,
      citationHandles: [...new Set(recipeCitations.map((citation) => citation.citationHandle))],
    };
  });
  const blocks = recipes.flatMap((recipe) => recipe.guidance);
  const uniqueBlocks = [...new Map(blocks.map((block) => [block.contentId, block])).values()];
  const trusted = {
    kind: "trusted_tool_result" as const,
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.trusted.v1` as const,
    data: {
      status: "educational_guidance" as const,
      responseMode: "educational" as const,
      blocks: uniqueBlocks,
      recipes,
      exclusions: value.composition.exclusions.map((item) => ({ contentId: item.contentId, reasonCodes: [...item.reasonCodes] })),
      provenance: boundedProvenance(snapshot.content, locale, "educational_guidance"),
    },
  };
  return finalizeTrusted(trusted, snapshot, scope);
}

type NutritionModelResult = ToolSafeProjectionMap[typeof TOOL_ID];

export function projectNutritionForModel(raw: unknown): NutritionModelResult {
  const trusted = SUGGEST_PEDIATRIC_NUTRITION_TRUSTED_RESULT_SCHEMA.safeParse(raw);
  if (!trusted.success) return safeFailure("PERSISTENCE_UNAVAILABLE");
  const value = trusted.data;
  if (value.data.status === "educational_guidance") {
    return projectToolResult(TOOL_ID, {
      kind: "tool_result",
      toolId: TOOL_ID,
      schemaVersion: `${TOOL_ID}.model.v1`,
      data: {
        status: "educational_guidance",
        blocks: value.data.blocks.map((block) => ({
          contentCode: block.contentId,
          kind: block.kind,
          title: block.title,
          text: block.text,
          citationHandles: block.citationHandles,
        })),
        recipes: value.data.recipes.map((recipe) => ({
          recipeCode: recipe.recipeId,
          title: recipe.title,
          ingredientCodes: recipe.ingredientCodes,
          preparationSteps: recipe.transformations.length > 0
            ? recipe.approvedTextureText.map((item) => item.text)
            : recipe.preparationSteps,
          texture: recipe.texture,
          supervision: recipe.supervision,
          citationHandles: recipe.citationHandles,
        })),
        exclusions: value.data.exclusions,
      },
    });
  }
  if (value.data.status === "professional_review") {
    return projectToolResult(TOOL_ID, {
      kind: "tool_result",
      toolId: TOOL_ID,
      schemaVersion: `${TOOL_ID}.model.v1`,
      data: {
        status: "professional_review",
        responseMode: "pediatrician_recommendation",
        reasonCodes: value.data.reasonCodes,
      },
    });
  }
  return projectToolResult(TOOL_ID, {
    kind: "tool_result",
    toolId: TOOL_ID,
    schemaVersion: `${TOOL_ID}.model.v1`,
    data: {
      status: "insufficient_data",
      reasonCodes: value.data.reasonCodes,
      missingFacts: value.data.missingFacts,
    },
  });
}

const invokeIdempotently = withToolIdempotency(
  IDEMPOTENCY_DEFINITION,
  async (runtime, input) => {
    const services = getTrustedToolServices(
      runtime.trustedContext as TrustedToolContext<NutritionGuidanceServices>,
    );
    const signal = getTrustedToolAbortSignal(runtime.trustedContext);
    const clock = services.toolIdempotency as Readonly<{ now(): Date }>;
    let cutoff: Date;
    try {
      cutoff = clock.now();
    } catch {
      return safeFailure("PERSISTENCE_UNAVAILABLE");
    }
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) return safeFailure("PERSISTENCE_UNAVAILABLE");
    abortIfNeeded(signal);
    const request = SUGGEST_PEDIATRIC_NUTRITION_INPUT_SCHEMA.safeParse(input);
    if (!request.success) return safeFailure("INPUT_INVALID");
    const scope = runtime.scope;
    const locale = getTrustedToolLocale(runtime.trustedContext);
    if (locale !== (scope.countryOfCare === "CO" ? "es-CO" : "en-US")) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    const port = services.nutritionGuidance;
    if (!port || typeof port !== "object" || typeof port.resolve !== "function") return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    let snapshotValue: NutritionGuidanceSnapshot;
    const cutoffAt = cutoff.toISOString();
    const normalizedInput = Object.freeze({
      ...request.data,
      maxRecipes: request.data.maxRecipes ?? MAX_RECIPES,
      seed: request.data.seed ?? DEFAULT_SEED,
    });
    try {
      snapshotValue = await port.resolve(Object.freeze({
        scope,
        locale,
        cutoffAt,
        input: normalizedInput,
        signal,
      }));
    } catch {
      if (signal.aborted) return safeFailure("CANCELLED");
      return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    }
    abortIfNeeded(signal);
    if (!snapshotValue || typeof snapshotValue !== "object" || ownKeys(snapshotValue) !== SNAPSHOT_KEYS
      || !validScope(scope, snapshotValue.revalidatedScope, cutoff)
      || !validProfile(snapshotValue.profile, cutoffAt, scope)
      || !validReactions(snapshotValue.reactions, cutoffAt)
      || !nutritionReadinessEvidenceSchema.safeParse(snapshotValue.readiness).success
      || !validAgeDisposition(snapshotValue.ageDisposition, snapshotValue.profile, cutoffAt)
      || !Array.isArray(snapshotValue.restrictions)
      || snapshotValue.restrictions.length > 100
      || !snapshotValue.restrictions.every((restriction) => foodRestrictionSchema.safeParse(restriction).success)
      || !CONCERNS.safeParse(snapshotValue.concerns).success
      || !z.enum(["none", "active", "unknown"]).safeParse(snapshotValue.professionalPlan).success
      || !z.enum(["adequate", "concern", "unknown"]).safeParse(snapshotValue.swallowingAbility).success
      || !SAFETY_DECISION.safeParse(snapshotValue.safetyDecision).success
      || !validContent(snapshotValue.content, scope, cutoff, locale)
      || !validEligibility(snapshotValue.eligibility, snapshotValue.content)
      || !validTexture(snapshotValue.texture, snapshotValue.composition)) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    if (!validCompositionForRequest(snapshotValue.composition, scope, request.data, cutoff, snapshotValue)) {
      return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    }
    if (!respectsProfileExclusions(snapshotValue.composition, snapshotValue.profile)) {
      return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    }
    if (snapshotValue.safetyDecision.decision === "urgent") return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    if (snapshotValue.readiness.status !== "ready") return safeFailure("CLINICAL_POLICY_UNAVAILABLE");

    const nutritionContext = {
      age: snapshotValue.profile.age,
      readiness: snapshotValue.readiness,
      feedingApproach: snapshotValue.profile.profile.feedingApproach,
      textureStage: snapshotValue.profile.profile.textureStage,
      restrictions: snapshotValue.restrictions,
      professionalPlan: snapshotValue.professionalPlan,
    };
    if (!nutritionContext.feedingApproach || !nutritionContext.textureStage) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    const restriction = restrictionSignal(snapshotValue.restrictions);
    const reaction = reactionSignal(snapshotValue.reactions);
    const abstentionContext = {
      cutoff,
      revalidatedScope: snapshotValue.revalidatedScope,
      safetyDecision: snapshotValue.safetyDecision,
      content: snapshotValue.content,
      composition: snapshotValue.composition,
      texture: snapshotValue.texture,
      signals: {
        age: snapshotValue.ageDisposition.status,
        reaction: reaction === "active" || restriction === "active"
          ? "active" as const
          : reaction === "unknown" || restriction === "unknown" ? "unknown" as const : "none" as const,
        swallowing: snapshotValue.swallowingAbility === "concern" || snapshotValue.concerns.swallowing === "active"
          ? "concern" as const
          : snapshotValue.swallowingAbility === "unknown" || snapshotValue.concerns.swallowing === "unknown"
            ? "unknown" as const : "none" as const,
        growthOrCondition: snapshotValue.concerns.poorGrowthOrCondition === "active" ? "concern" as const : snapshotValue.concerns.poorGrowthOrCondition,
        specialDiet: snapshotValue.concerns.specialDiet,
        professionalPlan: snapshotValue.professionalPlan,
        facts: "complete" as const,
      },
    };
    const abstention = applyNutritionAbstention(scope, abstentionContext);
    if (abstention.status === "emergency_only") return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    if (abstention.status === "educational_guidance"
      && request.data.maxRecipes !== undefined
      && abstention.composition.recipes.length > request.data.maxRecipes) return safeFailure("CLINICAL_POLICY_UNAVAILABLE");
    const trusted = trustedFromDomain(abstention, snapshotValue, scope, locale);
    return Object.freeze({ status: "no_effect" as const, result: trusted });
  },
);

const invokeWithAudit = withToolAudit(
  AUDIT_DEFINITION,
  async (context: TrustedToolContext, input: SuggestPediatricNutritionInput) => {
    const result = await invokeIdempotently(context, input, null);
    if ("allowed" in result) return safeFailure("CONFIRMATION_INVALID");
    return result;
  },
);

export async function executeSuggestPediatricNutrition(
  context: TrustedToolContext,
  input: SuggestPediatricNutritionInput,
): Promise<SuggestPediatricNutritionExecution> {
  try {
    const raw = await invokeWithAudit(context, input);
    if (!SUGGEST_PEDIATRIC_NUTRITION_OUTPUT_SCHEMA.safeParse(raw).success) return safeFailure("PERSISTENCE_UNAVAILABLE");
    return raw as SuggestPediatricNutritionExecution;
  } catch (error) {
    throw mapToolError(error, { effectState: "none" });
  }
}

export default defineTool({
  description: "Entrega orientación alimentaria pediátrica educativa usando contenido aprobado y reglas de edad, reacción y textura; no diagnostica ni prescribe dietas.",
  inputSchema: SUGGEST_PEDIATRIC_NUTRITION_INPUT_SCHEMA,
  outputSchema: SUGGEST_PEDIATRIC_NUTRITION_OUTPUT_SCHEMA,
  async execute(input, eveContext) {
    try {
      const trusted = await resolveTrustedToolContextForEve(eveContext, TOOL_ID);
      return await executeSuggestPediatricNutrition(trusted, input);
    } catch (error) {
      throw mapToolError(error, { effectState: "none" });
    }
  },
  toModelOutput(output) {
    return toolOutput.json(projectNutritionForModel(output.result));
  },
});
