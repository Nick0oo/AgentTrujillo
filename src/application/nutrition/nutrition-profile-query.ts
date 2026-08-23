import { createHash } from "node:crypto";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";
import {
  nutritionAgeEvidenceSchema,
  type NutritionAgeEvidence,
  type NutritionFeedingApproach,
  type NutritionTextureStage,
} from "../../clinical/nutrition/types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const FEEDING_MODES: readonly NutritionFeedingApproach[] = [
  "breastfeeding",
  "formula",
  "mixed",
  "traditional_complementary",
  "blw",
  "mixed_complementary",
  "family_food",
];
const TEXTURE_STAGES: readonly NutritionTextureStage[] = [
  "smooth_puree",
  "mashed",
  "soft_lumpy",
  "finger_food",
  "family_food",
  "unknown",
];

export type NutritionProfileCutoff = Date | string;

/** The scoped adapter returns only the columns needed by this query. */
export type NutritionProfileRow = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  feedingMode: string | null;
  textureStage: string | null;
  exclusions: readonly string[];
  createdAt: string;
  updatedAt: string;
}>;

export type NutritionAccessRevalidator = Readonly<{
  validate: (scope: AuthorizedChildScope, currentInstant: string) => Promise<AuthorizedChildScope | null>;
}>;

export type NutritionProfileRepository = Readonly<{
  getProfile: (scope: AuthorizedChildScope, cutoff: string) => Promise<NutritionProfileRow | null>;
}>;

export type NutritionAgePort = Readonly<{
  getAge: (scope: AuthorizedChildScope, cutoff: string) => Promise<NutritionAgeEvidence | null>;
}>;

export type NutritionProfileSource = Readonly<{
  sourceId: string;
  createdAt: string;
  updatedAt: string;
}>;

export type NutritionProfileProjection = Readonly<{
  feedingApproach: NutritionFeedingApproach | null;
  textureStage: NutritionTextureStage | null;
  /** These remain declared profile codes; they are not allergy/reaction facts. */
  exclusions: readonly string[];
  source: NutritionProfileSource;
}>;

export type NutritionProfileCompleteness = Readonly<{
  age: "complete";
  feedingApproach: "complete" | "missing";
  textureStage: "complete" | "missing";
  exclusions: "complete";
  professionalPlan: "unknown";
}>;

export type NutritionProfileQuerySuccess = Readonly<{
  ok: true;
  status: "available";
  age: NutritionAgeEvidence;
  profile: NutritionProfileProjection;
  professionalPlan: "unknown";
  completeness: NutritionProfileCompleteness;
  digest: Sha256Hex;
}>;

export type NutritionProfileQueryFailure = Readonly<{
  ok: false;
  status: "unavailable";
  /** One bounded failure code prevents target existence or failure cause leakage. */
  code: "NUTRITION_PROFILE_UNAVAILABLE";
}>;

export type NutritionProfileQueryResult = NutritionProfileQuerySuccess | NutritionProfileQueryFailure;

export type NutritionProfileQueryDependencies = Readonly<{
  accessRevalidator: NutritionAccessRevalidator;
  profileRepository: NutritionProfileRepository;
  agePort: NutritionAgePort;
}>;

export type NutritionProfileQueryOptions = Readonly<{
  now?: () => Date;
}>;

export interface NutritionProfileQuery {
  execute(scope: AuthorizedChildScope, cutoff: NutritionProfileCutoff): Promise<NutritionProfileQueryResult>;
}

const FAILURE: NutritionProfileQueryFailure = Object.freeze({
  ok: false as const,
  status: "unavailable" as const,
  code: "NUTRITION_PROFILE_UNAVAILABLE" as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeCutoff(value: NutritionProfileCutoff): Readonly<{ date: Date; iso: string }> | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const date = new Date(value.getTime());
    return Object.freeze({ date, iso: date.toISOString() });
  }
  const date = parseInstant(value);
  return date === null ? null : Object.freeze({ date, iso: date.toISOString() });
}

function validScopeAt(scope: AuthorizedChildScope, cutoff: Date): boolean {
  try {
    if (!isRecord(scope)
      || !(scope.issuedAt instanceof Date)
      || !(scope.expiresAt instanceof Date)
      || Number.isNaN(scope.issuedAt.getTime())
      || Number.isNaN(scope.expiresAt.getTime())
      || typeof scope.timezone !== "string"
      || typeof scope.careSpaceId !== "string"
      || typeof scope.childId !== "string") return false;
    return isAuthorizedChildScopeActive(scope, cutoff) && hasPermission(scope, "read", cutoff);
  } catch {
    return false;
  }
}

function normalizeRowInstant(value: unknown): string | null {
  const parsed = parseInstant(value);
  return parsed === null ? null : parsed.toISOString();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function normalizeProfile(
  row: NutritionProfileRow,
  scope: AuthorizedChildScope,
  cutoff: Date,
): NutritionProfileProjection | null {
  if (!isRecord(row)
    || !isUuid(row.id)
    || !isUuid(row.careSpaceId)
    || !isUuid(row.childId)
    || row.careSpaceId !== scope.careSpaceId
    || row.childId !== scope.childId
    || (row.feedingMode !== null && !isOneOf(row.feedingMode, FEEDING_MODES))
    || (row.textureStage !== null && !isOneOf(row.textureStage, TEXTURE_STAGES))
    || !Array.isArray(row.exclusions)
    || row.exclusions.length > 100
    || row.exclusions.some((code) => !isCode(code))) return null;

  const createdAt = normalizeRowInstant(row.createdAt);
  const updatedAt = normalizeRowInstant(row.updatedAt);
  if (createdAt === null || updatedAt === null) return null;

  const createdDate = new Date(createdAt);
  const updatedDate = new Date(updatedAt);
  if (createdDate > updatedDate || updatedDate > cutoff || createdDate > cutoff) return null;

  const sortedExclusions = [...row.exclusions].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (new Set(sortedExclusions).size !== sortedExclusions.length) return null;

  return Object.freeze({
    feedingApproach: row.feedingMode as NutritionFeedingApproach | null,
    textureStage: row.textureStage as NutritionTextureStage | null,
    exclusions: Object.freeze(sortedExclusions),
    source: Object.freeze({ sourceId: row.id, createdAt, updatedAt }),
  });
}

function normalizeAge(
  value: NutritionAgeEvidence,
  scope: AuthorizedChildScope,
  cutoff: Readonly<{ date: Date; iso: string }>,
): NutritionAgeEvidence | null {
  const parsed = nutritionAgeEvidenceSchema.safeParse(value);
  if (!parsed.success) return null;

  const evidence = parsed.data;
  const referenceInstant = parseInstant(evidence.referenceInstant);
  const observedAt = parseInstant(evidence.provenance.observedAt);
  if (referenceInstant === null
    || observedAt === null
    || referenceInstant.getTime() !== cutoff.date.getTime()
    || evidence.timeZone !== scope.timezone
    || observedAt > cutoff.date) return null;

  return Object.freeze({
    ...evidence,
    referenceInstant: cutoff.iso,
    provenance: Object.freeze({
      ...evidence.provenance,
      observedAt: observedAt.toISOString(),
    }),
  }) as NutritionAgeEvidence;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_CANONICAL_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const members = Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(",")}}`;
  }
  throw new Error("NON_CANONICAL_VALUE");
}

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function createNutritionProfileQuery(
  dependencies: NutritionProfileQueryDependencies,
  options: NutritionProfileQueryOptions = {},
): NutritionProfileQuery {
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    async execute(scope: AuthorizedChildScope, cutoff: NutritionProfileCutoff): Promise<NutritionProfileQueryResult> {
      const normalizedCutoff = normalizeCutoff(cutoff);
      let requestNow: Date;
      try {
        requestNow = now();
      } catch {
        return FAILURE;
      }
      const normalizedRequestNow = normalizeCutoff(requestNow);
      if (normalizedCutoff === null
        || normalizedRequestNow === null
        || !validScopeAt(scope, normalizedRequestNow.date)) return FAILURE;

      let freshScope: AuthorizedChildScope | null;
      try {
        freshScope = await dependencies.accessRevalidator.validate(scope, normalizedRequestNow.iso);
      } catch {
        return FAILURE;
      }
      try {
        if (freshScope === null
          || freshScope === undefined
          || !sameAuthorizedChildScope(scope, freshScope)
          || freshScope.countryOfCare !== scope.countryOfCare
          || freshScope.timezone !== scope.timezone
          || freshScope.permissions.some((permission) => !scope.permissions.includes(permission))
          || !validScopeAt(freshScope, normalizedRequestNow.date)) return FAILURE;
      } catch {
        return FAILURE;
      }

      let rawProfile: NutritionProfileRow | null;
      try {
        rawProfile = await dependencies.profileRepository.getProfile(freshScope, normalizedCutoff.iso);
      } catch {
        return FAILURE;
      }
      if (rawProfile === null || rawProfile === undefined) return FAILURE;

      const profile = normalizeProfile(rawProfile, freshScope, normalizedCutoff.date);
      if (profile === null) return FAILURE;

      let rawAge: NutritionAgeEvidence | null;
      try {
        rawAge = await dependencies.agePort.getAge(freshScope, normalizedCutoff.iso);
      } catch {
        return FAILURE;
      }
      if (rawAge === null || rawAge === undefined) return FAILURE;

      const age = normalizeAge(rawAge, freshScope, normalizedCutoff);
      if (age === null) return FAILURE;

      const professionalPlan = "unknown" as const;
      const completeness: NutritionProfileCompleteness = {
        age: "complete",
        feedingApproach: profile.feedingApproach === null ? "missing" : "complete",
        textureStage: profile.textureStage === null ? "missing" : "complete",
        exclusions: "complete",
        professionalPlan,
      };
      const material = {
        algorithmVersion: "nutrition-profile-query.v1",
        cutoff: normalizedCutoff.iso,
        age,
        profile,
        professionalPlan,
        completeness,
      };
      const result: NutritionProfileQuerySuccess = {
        ok: true,
        status: "available",
        age,
        profile,
        professionalPlan,
        completeness,
        digest: digest(material),
      };
      return deepFreeze(result);
    },
  });
}
