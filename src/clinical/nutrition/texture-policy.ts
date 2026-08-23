import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { NutritionCompositionResult } from "./composer.ts";
import { isPrimaryAuthority } from "../governance/source-policy.ts";
import type { ClinicalAuthority, Sha256Hex } from "../governance/source-types.ts";
import type { NutritionFeedingApproach } from "./types.ts";

const DIGEST = /^[a-f0-9]{64}$/u;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ZERO_DIGEST = "0".repeat(64) as Sha256Hex;
const APPROVAL_RECORD_DIGEST = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
const ALGORITHM_ID = "texture-safety";
const ALGORITHM_VERSION = "texture-safety.v1";

const codeSchema = z.string().regex(CODE);
const digestSchema = z.string().regex(DIGEST);
const presentationSchema = z.object({
  ingredientCode: codeSchema,
  formCode: codeSchema,
  shapeCode: codeSchema,
  sizeCode: codeSchema,
  textureCode: codeSchema,
}).strict();
const requestSchema = z.object({
  recipeId: codeSchema,
  presentations: z.array(presentationSchema).max(100).readonly(),
}).strict();

export type TextureSafetyPresentation = Readonly<z.infer<typeof presentationSchema>>;
export type TextureSafetyRequest = Readonly<z.infer<typeof requestSchema>>;
export type TextureDispositionStatus = "allowed" | "transform_required" | "excluded" | "review_required";

export type TextureTransformation = Readonly<{
  formCode: string;
  shapeCode: string;
  sizeCode: string;
  textureCode: string;
}>;

export type TextureSafetyRule = Readonly<{
  id: string;
  ingredientCode: string;
  formCode: string;
  shapeCode: string;
  sizeCode: string;
  textureCode: string;
  disposition: Exclude<TextureDispositionStatus, "review_required">;
  reasonCode: string;
  approvedBlockId: string;
  transformation: TextureTransformation | null;
}>;

export type TextureSafetySource = Readonly<{
  sourceId: string;
  authority: ClinicalAuthority;
  jurisdiction: "CO" | "US" | "GLOBAL";
  sourceUri: string;
  artifactSha256: Sha256Hex;
  license: string;
}>;

export type TextureSafetyRulePack = Readonly<{
  packageId: string;
  packageVersion: string;
  country: "CO" | "US";
  effectiveFrom: string;
  effectiveUntil: string | null;
  algorithmVersion: typeof ALGORITHM_VERSION;
  contentArtifactSha256: Sha256Hex;
  fixturesSha256: Sha256Hex;
  rightsSha256: Sha256Hex;
  sources: readonly TextureSafetySource[];
  rules: readonly TextureSafetyRule[];
  fallbackBlockIds: Readonly<{
    reviewRequired: string;
    readinessNotReady: string;
    swallowingConcern: string;
  }>;
  status: "draft" | "released" | "retired" | "revoked";
  current: boolean;
  revoked: boolean;
  artifactSha256: Sha256Hex;
  approval: Readonly<{
    status: "approved" | "withdrawn" | "revoked";
    current: boolean;
    revoked: boolean;
    digest: Sha256Hex;
    recordDigest: Sha256Hex;
    approvedArtifactSha256: Sha256Hex;
  }>;
}>;

export type TextureSafetyContext = Readonly<{
  cutoff: Date;
  revalidatedScope: AuthorizedChildScope | null;
  composition: NutritionCompositionResult;
  feedingApproach: NutritionFeedingApproach;
  readiness: "ready" | "not_ready" | "unknown" | "review_required";
  swallowingAbility: "adequate" | "concern" | "unknown";
  rulePack: TextureSafetyRulePack;
}>;

export type TextureDisposition = Readonly<{
  status: TextureDispositionStatus;
  recipeId: string;
  reasonCodes: readonly string[];
  approvedText: readonly Readonly<{ blockId: string; text: string }>[];
  transformations: readonly Readonly<{
    ingredientCode: string;
    from: TextureTransformation;
    to: TextureTransformation;
    approvedBlockId: string;
  }>[];
  provenance: Readonly<{
    packageId: string;
    packageVersion: string;
    artifactSha256: Sha256Hex;
    sourceDigests: readonly Sha256Hex[];
    algorithmId: typeof ALGORITHM_ID;
    algorithmVersion: typeof ALGORITHM_VERSION;
    inputDigest: Sha256Hex;
    decisionDigest: Sha256Hex;
  }>;
}>;

export type TextureSafetyResult =
  | Readonly<{ ok: true; disposition: TextureDisposition }>
  | Readonly<{ ok: false; reasonCode: "NOT_AUTHORIZED" | "INVALID_REQUEST" | "COMPOSITION_INVALID" | "RULE_PACK_UNAVAILABLE" | "INTERNAL_ERROR" }>;

const ruleSchema = z.object({
  id: codeSchema,
  ingredientCode: codeSchema,
  formCode: codeSchema,
  shapeCode: codeSchema,
  sizeCode: codeSchema,
  textureCode: codeSchema,
  disposition: z.enum(["allowed", "transform_required", "excluded"]),
  reasonCode: codeSchema,
  approvedBlockId: codeSchema,
  transformation: z.object({
    formCode: codeSchema,
    shapeCode: codeSchema,
    sizeCode: codeSchema,
    textureCode: codeSchema,
  }).strict().nullable(),
}).strict().superRefine((rule, refinement) => {
  if ((rule.disposition === "transform_required") !== (rule.transformation !== null)) {
    refinement.addIssue({ code: "custom", path: ["transformation"], message: "transformation must match disposition" });
  }
});

const sourceSchema = z.object({
  sourceId: codeSchema,
  authority: z.enum(["MINSALUD_PAI", "CDC_ACIP", "WHO", "INVIMA", "NLM_DAILYMED", "NLM_RXNORM", "FDA"]),
  jurisdiction: z.enum(["CO", "US", "GLOBAL"]),
  sourceUri: z.string().url().refine((value) => new URL(value).protocol === "https:"),
  artifactSha256: digestSchema,
  license: z.string().min(1).max(500).refine((value) => value.trim().length > 0),
}).strict();

const packSchema = z.object({
  packageId: codeSchema,
  packageVersion: codeSchema,
  country: z.enum(["CO", "US"]),
  effectiveFrom: z.string().regex(DATE),
  effectiveUntil: z.string().regex(DATE).nullable(),
  algorithmVersion: z.literal(ALGORITHM_VERSION),
  contentArtifactSha256: digestSchema,
  fixturesSha256: digestSchema,
  rightsSha256: digestSchema,
  sources: z.array(sourceSchema).min(1).max(100).readonly(),
  rules: z.array(ruleSchema).min(1).max(500).readonly(),
  fallbackBlockIds: z.object({
    reviewRequired: codeSchema,
    readinessNotReady: codeSchema,
    swallowingConcern: codeSchema,
  }).strict(),
  status: z.enum(["draft", "released", "retired", "revoked"]),
  current: z.boolean(),
  revoked: z.boolean(),
  artifactSha256: digestSchema,
  approval: z.object({
    status: z.enum(["approved", "withdrawn", "revoked"]),
    current: z.boolean(),
    revoked: z.boolean(),
    digest: digestSchema,
    recordDigest: digestSchema,
    approvedArtifactSha256: digestSchema,
  }).strict(),
}).strict().superRefine((pack, refinement) => {
  if (pack.effectiveUntil !== null && pack.effectiveUntil < pack.effectiveFrom) {
    refinement.addIssue({ code: "custom", path: ["effectiveUntil"], message: "invalid effective window" });
  }
  const ruleKeys = pack.rules.map((rule) => canonicalize([
    rule.ingredientCode,
    rule.formCode,
    rule.shapeCode,
    rule.sizeCode,
    rule.textureCode,
  ]));
  const ruleIds = pack.rules.map((rule) => rule.id);
  if (new Set(ruleKeys).size !== ruleKeys.length || new Set(ruleIds).size !== ruleIds.length) {
    refinement.addIssue({ code: "custom", path: ["rules"], message: "ambiguous rules" });
  }
  const sourceIds = pack.sources.map((source) => source.sourceId);
  const sourceDigests = pack.sources.map((source) => source.artifactSha256);
  if (new Set(sourceIds).size !== sourceIds.length || new Set(sourceDigests).size !== sourceDigests.length) {
    refinement.addIssue({ code: "custom", path: ["sources"], message: "duplicate source evidence" });
  }
});

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(values)].sort(compare));
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function computeTextureSafetyArtifactSha256(input: unknown): Sha256Hex {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return hash(input);
  const { artifactSha256: _artifact, approval: _approval, ...material } = input as Record<string, unknown>;
  return hash(material);
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

function localDate(cutoff: Date, timeZone: string): string | null {
  try {
    const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(cutoff).map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
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

function validPack(
  raw: TextureSafetyRulePack,
  scope: AuthorizedChildScope,
  cutoff: Date,
  composition: Extract<NutritionCompositionResult, { status: "composed" }>,
): TextureSafetyRulePack | null {
  const parsed = packSchema.safeParse(raw);
  if (!parsed.success) return null;
  const pack = parsed.data as TextureSafetyRulePack;
  const date = localDate(cutoff, scope.timezone);
  if (date === null
    || pack.country !== scope.countryOfCare
    || pack.contentArtifactSha256 !== composition.provenance.artifactSha256
    || pack.status !== "released" || !pack.current || pack.revoked
    || pack.fixturesSha256 === ZERO_DIGEST || pack.rightsSha256 === ZERO_DIGEST
    || pack.approval.status !== "approved" || !pack.approval.current || pack.approval.revoked
    || pack.approval.digest === ZERO_DIGEST
    || pack.approval.recordDigest !== APPROVAL_RECORD_DIGEST
    || pack.approval.approvedArtifactSha256 !== pack.artifactSha256
    || computeTextureSafetyArtifactSha256(pack) !== pack.artifactSha256
    || date < pack.effectiveFrom || (pack.effectiveUntil !== null && date > pack.effectiveUntil)
    || !exactSourceDigests(pack.sources, composition.provenance.sourceDigests)
    || pack.sources.some((source) => !isPrimaryAuthority(source.authority, source.jurisdiction, "nutrition"))) return null;
  return pack;
}

function exactSourceDigests(sources: readonly TextureSafetySource[], expected: readonly Sha256Hex[]): boolean {
  const actual = sorted(sources.map((source) => source.artifactSha256));
  const wanted = sorted(expected);
  return actual.length === wanted.length && actual.every((value, index) => value === wanted[index]);
}

function presentationKey(value: TextureSafetyPresentation): string {
  return canonicalize([value.ingredientCode, value.formCode, value.shapeCode, value.sizeCode, value.textureCode]);
}

function ruleKey(value: TextureSafetyRule): string {
  return canonicalize([value.ingredientCode, value.formCode, value.shapeCode, value.sizeCode, value.textureCode]);
}

const priority: Readonly<Record<TextureDispositionStatus, number>> = {
  allowed: 0,
  transform_required: 1,
  review_required: 2,
  excluded: 3,
};

/** Active choking is handled before this pure policy by Module 04 preflight. */
export function evaluateTextureSafety(
  requestScope: AuthorizedChildScope,
  rawRequest: TextureSafetyRequest,
  context: TextureSafetyContext,
): TextureSafetyResult {
  try {
    const cutoff = context.cutoff;
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())
      || !currentScope(requestScope, context.revalidatedScope, cutoff)) return Object.freeze({ ok: false, reasonCode: "NOT_AUTHORIZED" });
    const requestResult = requestSchema.safeParse(rawRequest);
    if (!requestResult.success) return Object.freeze({ ok: false, reasonCode: "INVALID_REQUEST" });
    if (!validComposition(context.composition)) return Object.freeze({ ok: false, reasonCode: "COMPOSITION_INVALID" });
    const pack = validPack(context.rulePack, requestScope, cutoff, context.composition);
    if (pack === null) return Object.freeze({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });
    if (!["breastfeeding", "formula", "mixed", "traditional_complementary", "blw", "mixed_complementary", "family_food"].includes(context.feedingApproach)
      || !["ready", "not_ready", "unknown", "review_required"].includes(context.readiness)
      || !["adequate", "concern", "unknown"].includes(context.swallowingAbility)) return Object.freeze({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });

    const request = requestResult.data;
    const recipe = context.composition.recipes.find((item) => item.id === request.recipeId);
    if (recipe === undefined) return Object.freeze({ ok: false, reasonCode: "COMPOSITION_INVALID" });
    const availableBlocks = new Map(recipe.guidance.map((block) => [block.id, block.text]));
    const recipeIngredients = new Set(recipe.ingredientCodes);
    const applicableRules = pack.rules.filter((rule) => recipeIngredients.has(rule.ingredientCode));
    const requiredBlockIds = [
      pack.fallbackBlockIds.reviewRequired,
      pack.fallbackBlockIds.readinessNotReady,
      pack.fallbackBlockIds.swallowingConcern,
      ...applicableRules.map((rule) => rule.approvedBlockId),
    ];
    if (requiredBlockIds.some((blockId) => !availableBlocks.has(blockId))) return Object.freeze({ ok: false, reasonCode: "RULE_PACK_UNAVAILABLE" });

    const ingredientCodes = sorted(recipe.ingredientCodes);
    const presentedCodes = sorted(request.presentations.map((item) => item.ingredientCode));
    const duplicatePresentation = new Set(request.presentations.map((item) => item.ingredientCode)).size !== request.presentations.length;
    const closureComplete = !duplicatePresentation
      && ingredientCodes.length === presentedCodes.length
      && ingredientCodes.every((value, index) => value === presentedCodes[index]);
    const decisions: Array<Readonly<{
      status: TextureDispositionStatus;
      reasonCode: string;
      blockId: string;
      presentation?: TextureSafetyPresentation;
      rule?: TextureSafetyRule;
    }>> = [];

    if (!closureComplete) decisions.push({ status: "review_required", reasonCode: "ingredient_closure_incomplete", blockId: pack.fallbackBlockIds.reviewRequired });
    else if (context.readiness === "not_ready") decisions.push({ status: "excluded", reasonCode: "readiness_not_ready", blockId: pack.fallbackBlockIds.readinessNotReady });
    else if (context.readiness !== "ready") decisions.push({ status: "review_required", reasonCode: "readiness_unknown", blockId: pack.fallbackBlockIds.reviewRequired });
    else if (context.swallowingAbility !== "adequate") decisions.push({ status: "review_required", reasonCode: context.swallowingAbility === "concern" ? "swallowing_concern" : "swallowing_unknown", blockId: pack.fallbackBlockIds.swallowingConcern });
    else {
      const rules = new Map(applicableRules.map((item) => [ruleKey(item), item]));
      for (const presentation of request.presentations) {
        if ([presentation.formCode, presentation.shapeCode, presentation.sizeCode, presentation.textureCode].includes("unknown")) {
          decisions.push({ status: "review_required", reasonCode: "preparation_unknown", blockId: pack.fallbackBlockIds.reviewRequired });
          continue;
        }
        const rule = rules.get(presentationKey(presentation));
        if (rule === undefined) decisions.push({ status: "review_required", reasonCode: "rule_unavailable", blockId: pack.fallbackBlockIds.reviewRequired });
        else decisions.push({ status: rule.disposition, reasonCode: rule.reasonCode, blockId: rule.approvedBlockId, presentation, rule });
      }
    }

    const status = decisions.reduce<TextureDispositionStatus>((current, item) => priority[item.status] > priority[current] ? item.status : current, "allowed");
    const decisive = decisions.filter((item) => item.status === status);
    const approvedText = sorted(decisive.map((item) => item.blockId)).map((blockId) => ({ blockId, text: availableBlocks.get(blockId)! }));
    const transformations = status === "transform_required" ? decisive.flatMap((item) => item.rule?.transformation !== null
      && item.rule?.transformation !== undefined && item.presentation !== undefined ? [{
        ingredientCode: item.presentation.ingredientCode,
        from: {
          formCode: item.presentation.formCode,
          shapeCode: item.presentation.shapeCode,
          sizeCode: item.presentation.sizeCode,
          textureCode: item.presentation.textureCode,
        },
        to: item.rule.transformation,
        approvedBlockId: item.rule.approvedBlockId,
      }] : []).sort((left, right) => compare(left.ingredientCode, right.ingredientCode)) : [];
    const sourceDigests = sorted(pack.sources.map((source) => source.artifactSha256)) as readonly Sha256Hex[];
    const provenance = {
      packageId: pack.packageId,
      packageVersion: pack.packageVersion,
      artifactSha256: pack.artifactSha256,
      sourceDigests,
      algorithmId: ALGORITHM_ID as typeof ALGORITHM_ID,
      algorithmVersion: ALGORITHM_VERSION as typeof ALGORITHM_VERSION,
      inputDigest: hash({
        cutoff: cutoff.toISOString(),
        compositionDigest: context.composition.provenance.compositionDigest,
        recipeId: request.recipeId,
        presentations: [...request.presentations].sort((left, right) => compare(presentationKey(left), presentationKey(right))),
        readiness: context.readiness,
        swallowingAbility: context.swallowingAbility,
        rulePackArtifactSha256: pack.artifactSha256,
      }),
    };
    const disposition: TextureDisposition = {
      status,
      recipeId: request.recipeId,
      reasonCodes: sorted(decisive.map((item) => item.reasonCode)),
      approvedText,
      transformations,
      provenance: {
        ...provenance,
        decisionDigest: hash({ status, recipeId: request.recipeId, reasonCodes: sorted(decisive.map((item) => item.reasonCode)), approvedText, transformations, provenance }),
      },
    };
    return deepFreeze({ ok: true, disposition });
  } catch {
    return Object.freeze({ ok: false, reasonCode: "INTERNAL_ERROR" });
  }
}
