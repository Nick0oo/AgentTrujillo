import { z } from "zod";

import type { CountryCode, Sha256Hex } from "../governance/source-types.ts";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    && date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const nonEmptyText = z.string().min(1).max(500).refine((value) => value.trim().length > 0, "non-empty text");
const code = z.string().regex(CODE_PATTERN, "invalid code");
const isoDate = z.string().refine(isIsoDate, "ISO calendar date");
const isoInstant = z.string().datetime({ offset: true });
const timeZone = z.string().min(1).refine(isValidTimeZone, "IANA time zone");
const digest = z.string().regex(SHA256_PATTERN, "SHA-256 digest");
const ageDays = z.number().int().nonnegative();
const locale = z.string().regex(LOCALE_PATTERN, "locale");

export type NutritionCountry = Exclude<CountryCode, "GLOBAL">;
export type NutritionFactSource = "guardian" | "professional" | "import" | "document" | "chat" | "system";
export type NutritionFeedingApproach =
  | "breastfeeding"
  | "formula"
  | "mixed"
  | "traditional_complementary"
  | "blw"
  | "mixed_complementary"
  | "family_food";
export type NutritionTextureStage = "smooth_puree" | "mashed" | "soft_lumpy" | "finger_food" | "family_food" | "unknown";
export type NutritionReadinessStatus = "ready" | "not_ready" | "unknown" | "review_required";

export type NutritionFactProvenance = Readonly<{
  provenanceType: NutritionFactSource;
  sourceId: string;
  sourceDigest: Sha256Hex;
  observedAt: string;
}>;

export type NutritionAgeEvidence = Readonly<{
  ageDays: number;
  basis: "chronological" | "corrected";
  referenceInstant: string;
  timeZone: string;
  algorithmVersion: string;
  provenance: NutritionFactProvenance;
}>;

export type NutritionReadinessEvidence = Readonly<{
  status: NutritionReadinessStatus;
  provenance: NutritionFactProvenance;
}>;

export type FoodRestrictionState = "declared" | "confirmed" | "resolved" | "entered_in_error" | "unknown";
export type FoodRestrictionSeverity = "mild" | "moderate" | "severe" | "unknown";

type FoodRestrictionCommon = Readonly<{
  foodCode: string | null;
  foodLabel: string;
  state: FoodRestrictionState;
  supersedesId: string | null;
  provenance: NutritionFactProvenance;
}>;

export type FoodRestriction =
  | (FoodRestrictionCommon & { kind: "allergy"; severity: FoodRestrictionSeverity })
  | (FoodRestrictionCommon & { kind: "intolerance"; severity: FoodRestrictionSeverity })
  | (FoodRestrictionCommon & { kind: "reaction"; severity: FoodRestrictionSeverity })
  | (FoodRestrictionCommon & { kind: "dislike"; severity?: null })
  | (FoodRestrictionCommon & { kind: "preference"; severity?: null })
  | (FoodRestrictionCommon & { kind: "unknown"; severity: null; reasonCode: string });

export type NutritionContext = Readonly<{
  age: NutritionAgeEvidence;
  readiness: NutritionReadinessEvidence;
  feedingApproach: NutritionFeedingApproach | null;
  textureStage: NutritionTextureStage | null;
  restrictions: readonly FoodRestriction[];
  professionalPlan: "none" | "active" | "unknown";
}>;

export type NutritionSourceProvenance = Readonly<{
  sourceId: string;
  sourceUri: string;
  sourceVersion: string;
  artifactSha256: Sha256Hex;
  license: string;
  retrievedAt: string;
}>;

export type NutritionContentProvenance = Readonly<{
  packageId: string;
  packageVersion: string;
  algorithmVersion: string;
  fixturesSha256: Sha256Hex;
  rightsSha256: Sha256Hex;
  jurisdiction: CountryCode;
  locale: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  translation: "original" | "translated" | "adapted";
  artifactSha256: Sha256Hex;
  approvalDigest: Sha256Hex;
  sources: readonly NutritionSourceProvenance[];
}>;

export type ApprovedGuidanceBlock = Readonly<{
  id: string;
  kind: "education" | "feeding" | "preparation" | "safety" | "exclusion";
  title: string;
  text: string;
  tags: readonly string[];
  minAgeDays: number;
  maxAgeDays: number | null;
  provenance: NutritionContentProvenance;
}>;

export type RecipeTemplate = Readonly<{
  id: string;
  title: string;
  ingredientCodes: readonly string[];
  guidanceBlockIds: readonly string[];
  exclusionCodes: readonly string[];
  preparationSteps: readonly string[];
  texture: NutritionTextureStage;
  supervision: "required" | "recommended";
  provenance: NutritionContentProvenance;
}>;

export type NutritionDecisionProvenance = Readonly<{
  packageId: string;
  packageVersion: string;
  artifactSha256: Sha256Hex;
  sourceDigests: readonly Sha256Hex[];
  algorithmId: string;
  algorithmVersion: string;
  inputDigest: Sha256Hex;
  decisionDigest: Sha256Hex;
}>;

export type NutritionEligibilityStatus = "eligible" | "excluded" | "review_required";
export type NutritionEligibility = Readonly<{
  contentId: string;
  contentType: "block" | "recipe";
  status: NutritionEligibilityStatus;
  matchedTags: readonly string[];
  reasonCodes: readonly string[];
  missingFacts: readonly string[];
  provenance: NutritionDecisionProvenance;
}>;

export type NutritionExclusion = Readonly<{
  contentId: string;
  code: string;
  reasonCode: string;
}>;

export type NutritionGuidanceResult =
  | Readonly<{
      status: "educational_guidance";
      blocks: readonly ApprovedGuidanceBlock[];
      recipes: readonly RecipeTemplate[];
      exclusions: readonly NutritionExclusion[];
      provenance: NutritionDecisionProvenance;
    }>
  | Readonly<{
      status: "insufficient_data";
      reasonCodes: readonly string[];
      missingFacts: readonly string[];
      provenance: NutritionDecisionProvenance | null;
    }>
  | Readonly<{
      status: "professional_review";
      responseMode: "pediatrician_recommendation";
      reasonCodes: readonly string[];
      provenance: NutritionDecisionProvenance | null;
    }>
  | Readonly<{
      status: "emergency_only";
      responseMode: "emergency_recommendation";
      reasonCode: string;
    }>;

export const nutritionFactProvenanceSchema = z.object({
  provenanceType: z.enum(["guardian", "professional", "import", "document", "chat", "system"]),
  sourceId: code,
  sourceDigest: digest,
  observedAt: isoInstant,
}).strict();

export const nutritionAgeEvidenceSchema = z.object({
  ageDays,
  basis: z.enum(["chronological", "corrected"]),
  referenceInstant: isoInstant,
  timeZone,
  algorithmVersion: code,
  provenance: nutritionFactProvenanceSchema,
}).strict();

export const nutritionReadinessEvidenceSchema = z.object({
  status: z.enum(["ready", "not_ready", "unknown", "review_required"]),
  provenance: nutritionFactProvenanceSchema,
}).strict();

const restrictionCommonSchema = {
  foodCode: code.nullable(),
  foodLabel: nonEmptyText,
  state: z.enum(["declared", "confirmed", "resolved", "entered_in_error", "unknown"]),
  supersedesId: code.nullable(),
  provenance: nutritionFactProvenanceSchema,
} as const;

export const foodRestrictionSchema = z.discriminatedUnion("kind", [
  z.object({ ...restrictionCommonSchema, kind: z.literal("allergy"), severity: z.enum(["mild", "moderate", "severe", "unknown"]) }).strict(),
  z.object({ ...restrictionCommonSchema, kind: z.literal("intolerance"), severity: z.enum(["mild", "moderate", "severe", "unknown"]) }).strict(),
  z.object({ ...restrictionCommonSchema, kind: z.literal("reaction"), severity: z.enum(["mild", "moderate", "severe", "unknown"]) }).strict(),
  z.object({ ...restrictionCommonSchema, kind: z.literal("dislike"), severity: z.null().optional() }).strict(),
  z.object({ ...restrictionCommonSchema, kind: z.literal("preference"), severity: z.null().optional() }).strict(),
  z.object({ ...restrictionCommonSchema, kind: z.literal("unknown"), severity: z.null(), reasonCode: code }).strict(),
]);

export const nutritionContextSchema = z.object({
  age: nutritionAgeEvidenceSchema,
  readiness: nutritionReadinessEvidenceSchema,
  feedingApproach: z.enum([
    "breastfeeding",
    "formula",
    "mixed",
    "traditional_complementary",
    "blw",
    "mixed_complementary",
    "family_food",
  ]).nullable(),
  textureStage: z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]).nullable(),
  restrictions: z.array(foodRestrictionSchema).max(100).readonly(),
  professionalPlan: z.enum(["none", "active", "unknown"]),
}).strict();

export const nutritionSourceProvenanceSchema = z.object({
  sourceId: code,
  sourceUri: z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS source URI"),
  sourceVersion: code,
  artifactSha256: digest,
  license: nonEmptyText,
  retrievedAt: isoInstant,
}).strict();

// This validates immutable artifact evidence shape only; AT-08-05 must resolve
// approval, rights, and revocation before constructing usable approved content.
export const nutritionContentProvenanceSchema = z.object({
  packageId: code,
  packageVersion: code,
  algorithmVersion: code,
  fixturesSha256: digest,
  rightsSha256: digest,
  jurisdiction: z.enum(["CO", "US", "GLOBAL"]),
  locale,
  effectiveFrom: isoDate,
  effectiveUntil: isoDate.nullable(),
  translation: z.enum(["original", "translated", "adapted"]),
  artifactSha256: digest,
  approvalDigest: digest,
  sources: z.array(nutritionSourceProvenanceSchema).min(1).max(100).readonly(),
}).strict().superRefine((value, context) => {
  if (value.effectiveUntil !== null && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "effectiveUntil precedes effectiveFrom" });
  }
});

export const approvedGuidanceBlockSchema = z.object({
  id: code,
  kind: z.enum(["education", "feeding", "preparation", "safety", "exclusion"]),
  title: nonEmptyText,
  text: nonEmptyText,
  tags: z.array(code).min(1).max(50).readonly(),
  minAgeDays: ageDays,
  maxAgeDays: ageDays.nullable(),
  provenance: nutritionContentProvenanceSchema,
}).strict().superRefine((value, context) => {
  if (value.maxAgeDays !== null && value.maxAgeDays < value.minAgeDays) {
    context.addIssue({ code: "custom", path: ["maxAgeDays"], message: "maxAgeDays precedes minAgeDays" });
  }
  if (new Set(value.tags).size !== value.tags.length) {
    context.addIssue({ code: "custom", path: ["tags"], message: "duplicate tags" });
  }
});

export const recipeTemplateSchema = z.object({
  id: code,
  title: nonEmptyText,
  ingredientCodes: z.array(code).min(1).max(100).readonly(),
  guidanceBlockIds: z.array(code).min(1).max(100).readonly(),
  exclusionCodes: z.array(code).max(100).readonly(),
  preparationSteps: z.array(nonEmptyText).min(1).max(50).readonly(),
  texture: z.enum(["smooth_puree", "mashed", "soft_lumpy", "finger_food", "family_food", "unknown"]),
  supervision: z.enum(["required", "recommended"]),
  provenance: nutritionContentProvenanceSchema,
}).strict();

export const nutritionDecisionProvenanceSchema = z.object({
  packageId: code,
  packageVersion: code,
  artifactSha256: digest,
  sourceDigests: z.array(digest).min(1).max(100).readonly(),
  algorithmId: code,
  algorithmVersion: code,
  inputDigest: digest,
  decisionDigest: digest,
}).strict();

export const nutritionEligibilitySchema = z.object({
  contentId: code,
  contentType: z.enum(["block", "recipe"]),
  status: z.enum(["eligible", "excluded", "review_required"]),
  matchedTags: z.array(code).max(100).readonly(),
  reasonCodes: z.array(code).min(1).max(100).readonly(),
  missingFacts: z.array(code).max(100).readonly(),
  provenance: nutritionDecisionProvenanceSchema,
}).strict();

export const nutritionExclusionSchema = z.object({
  contentId: code,
  code,
  reasonCode: code,
}).strict();

export const nutritionGuidanceResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("educational_guidance"),
    blocks: z.array(approvedGuidanceBlockSchema).max(100).readonly(),
    recipes: z.array(recipeTemplateSchema).max(100).readonly(),
    exclusions: z.array(nutritionExclusionSchema).max(100).readonly(),
    provenance: nutritionDecisionProvenanceSchema,
  }).strict(),
  z.object({
    status: z.literal("insufficient_data"),
    reasonCodes: z.array(code).min(1).max(100).readonly(),
    missingFacts: z.array(code).min(1).max(100).readonly(),
    provenance: nutritionDecisionProvenanceSchema.nullable(),
  }).strict(),
  z.object({
    status: z.literal("professional_review"),
    responseMode: z.literal("pediatrician_recommendation"),
    reasonCodes: z.array(code).min(1).max(100).readonly(),
    provenance: nutritionDecisionProvenanceSchema.nullable(),
  }).strict(),
  z.object({
    status: z.literal("emergency_only"),
    responseMode: z.literal("emergency_recommendation"),
    reasonCode: code,
  }).strict(),
]);

export type NutritionContextInput = z.infer<typeof nutritionContextSchema>;
export type NutritionFactProvenanceInput = z.infer<typeof nutritionFactProvenanceSchema>;
export type FoodRestrictionInput = z.infer<typeof foodRestrictionSchema>;
export type ApprovedGuidanceBlockInput = z.infer<typeof approvedGuidanceBlockSchema>;
export type RecipeTemplateInput = z.infer<typeof recipeTemplateSchema>;
export type NutritionEligibilityInput = z.infer<typeof nutritionEligibilitySchema>;
export type NutritionGuidanceResultInput = z.infer<typeof nutritionGuidanceResultSchema>;
