import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  CONVEYED_APPROVAL_RECORD_SHA256,
  computeDevelopmentFrameworkArtifactSha256,
  type DevelopmentFrameworkResolution,
} from "../../clinical/development/framework-resolver.ts";
import {
  caregiverMilestoneItemSchema,
  developmentFrameworkSchema,
  type CaregiverMilestoneItem,
  type DevelopmentSourceProvenance,
} from "../../clinical/development/types.ts";
import type { Sha256Hex } from "../../clinical/governance/source-types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TRUSTED_PEDIATRIC_AGE_DAYS = 18 * 366;
const CHILD_PERMISSIONS = ["read", "record", "manage_documents", "manage_medication", "manage_guardians"] as const;
const PROFESSIONAL_MARKER = /\b(?:ead\s*[-–—]?\s*3|professional[\s_-]+instrument|instrumento[\s_-]+profesional|scor(?:e|es|ing)|screening|puntajes?|puntuaci[oó]n(?:es)?|cut[\s_-]*off|classif(?:ication|ications)|clasificaci[oó]n|examiners?|diagnos(?:e|ed|es|is|tic)|diagn[oó]stic(?:o|a|os|as)?|delay(?:ed|s)?|retrasos?|retrasad[oa]s?|cribado|autism|autismo|abnormal|anormal|normal(?:ity|ly)?|normalidad|pass|fail|aprob(?:ado|ada|ados|adas)|reprob(?:ado|ada|ados|adas)|tamizaje)\b/iu;

export const CAREGIVER_MILESTONE_DISCLAIMER = "Communication aid only; not a developmental standard, screening tool, diagnostic tool, or proof of normality." as const;

export type MilestoneCutoff = Date | string;

/** Trusted system-produced age; this query never calculates or substitutes an age. */
type MilestoneAgeEvidence = Readonly<{
  ageDays: number;
  referenceInstant: string;
  timeZone: string;
  algorithmVersion: string;
  provenance: Readonly<{
    provenanceType: "system";
    sourceId: string;
    sourceDigest: Sha256Hex;
    observedAt: string;
  }>;
}>;

export type MilestoneCorrectionPolicy = Readonly<{
  policyId: string;
  policyVersion: string;
  artifactSha256: Sha256Hex;
  approvalDigest: Sha256Hex;
}>;

export type MilestoneAgeWindow =
  | (MilestoneAgeEvidence & Readonly<{
      basis: "chronological";
      correctionPolicy?: never;
    }>)
  | (MilestoneAgeEvidence & Readonly<{
      basis: "corrected";
      correctionPolicy: MilestoneCorrectionPolicy;
    }>);

export type MilestoneQueryInput = Readonly<{
  frameworkId: string;
  ageWindow: MilestoneAgeWindow;
  locale: string;
  cutoff: MilestoneCutoff;
}>;

export type MilestoneFrameworkResolveInput = Readonly<{
  frameworkId: string;
  locale: string;
  cutoff: string;
}>;

export type MilestoneAccessRevalidator = Readonly<{
  validate: (scope: AuthorizedChildScope, currentInstant: string) => Promise<AuthorizedChildScope | null>;
}>;

export type MilestoneAgeEvidenceRequest = Readonly<{
  basis: MilestoneAgeWindow["basis"];
  cutoff: string;
  timeZone: string;
}>;

/** Resolves age from trusted system evidence scoped to the authorized child. */
export type MilestoneAgeEvidencePort = Readonly<{
  resolve: (
    scope: AuthorizedChildScope,
    input: MilestoneAgeEvidenceRequest,
  ) => Promise<MilestoneAgeWindow | null>;
}>;

/** The adapter owns candidate loading and must return the AT-08-10 governed resolution. */
export type MilestoneFrameworkResolver = Readonly<{
  resolve: (
    scope: AuthorizedChildScope,
    input: MilestoneFrameworkResolveInput,
  ) => Promise<DevelopmentFrameworkResolution | null>;
}>;

export type MilestoneQueryDependencies = Readonly<{
  accessRevalidator: MilestoneAccessRevalidator;
  ageEvidencePort: MilestoneAgeEvidencePort;
  frameworkResolver: MilestoneFrameworkResolver;
}>;

export type MilestoneCitation = Readonly<DevelopmentSourceProvenance>;

export type MilestoneRow = Readonly<{
  id: string;
  domain: CaregiverMilestoneItem["domain"];
  title: string;
  text: string;
  citations: readonly MilestoneCitation[];
}>;

export type MilestoneQuerySuccess = Readonly<{
  ok: true;
  status: "available";
  frameworkId: string;
  locale: string;
  milestones: readonly MilestoneRow[];
  disclaimer: typeof CAREGIVER_MILESTONE_DISCLAIMER;
  digest: Sha256Hex;
}>;

export type MilestoneQueryFailure = Readonly<{
  ok: false;
  status: "unavailable";
  code: "DEVELOPMENT_MILESTONES_UNAVAILABLE";
}>;

export type MilestoneQueryResult = MilestoneQuerySuccess | MilestoneQueryFailure;

export type MilestoneQueryOptions = Readonly<{
  now?: () => Date;
}>;

export interface MilestoneQuery {
  execute(scope: AuthorizedChildScope, input: MilestoneQueryInput): Promise<MilestoneQueryResult>;
}

const FAILURE: MilestoneQueryFailure = Object.freeze({
  ok: false as const,
  status: "unavailable" as const,
  code: "DEVELOPMENT_MILESTONES_UNAVAILABLE" as const,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function parseInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_INSTANT_PATTERN.test(value)) return null;
  if (!isValidCalendarDate(value.slice(0, 10))) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day;
}

function normalizeCutoff(value: unknown): Readonly<{ date: Date; iso: string }> | null {
  const date = value instanceof Date
    ? Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null
    : parseInstant(value);
  return date === null ? null : Object.freeze({ date, iso: date.toISOString() });
}

function localCalendarDate(instant: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${values.year}-${values.month}-${values.day}`;
    return isValidCalendarDate(date) ? date : null;
  } catch {
    return null;
  }
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function validScopeAt(scope: AuthorizedChildScope, now: Date): boolean {
  try {
    return isRecord(scope)
      && Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && scope.issuedAt instanceof Date
      && scope.expiresAt instanceof Date
      && Object.isFrozen(scope.issuedAt)
      && Object.isFrozen(scope.expiresAt)
      && Number.isFinite(scope.issuedAt.getTime())
      && Number.isFinite(scope.expiresAt.getTime())
      && scope.issuedAt < scope.expiresAt
      && UUID_PATTERN.test(scope.actorUserId)
      && UUID_PATTERN.test(scope.careSpaceId)
      && UUID_PATTERN.test(scope.childId)
      && Array.isArray(scope.permissions)
      && scope.permissions.length > 0
      && scope.permissions.every((permission) => isOneOf(permission, CHILD_PERMISSIONS))
      && new Set(scope.permissions).size === scope.permissions.length
      && isOneOf(scope.countryOfCare, ["CO", "US"] as const)
      && validTimeZone(scope.timezone)
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, "read", now);
  } catch {
    return false;
  }
}

const FORBIDDEN_AGE_SOURCE = /(?:model|llm|gemini|openrouter|guardian|unknown|fallback)/i;
const STRICT_AGE_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const ageProvenanceSchema = z.object({
  provenanceType: z.literal("system"),
  sourceId: z.string().regex(CODE_PATTERN).refine((value) => !FORBIDDEN_AGE_SOURCE.test(value)),
  sourceDigest: z.string().regex(DIGEST_PATTERN),
  observedAt: z.string().regex(STRICT_AGE_INSTANT_PATTERN).refine((value) => parseStrictAgeInstant(value) !== null),
}).strict();

const correctionPolicySchema = z.object({
  policyId: z.string().regex(CODE_PATTERN).refine((value) => !FORBIDDEN_AGE_SOURCE.test(value)),
  policyVersion: z.string().regex(CODE_PATTERN).refine((value) => !FORBIDDEN_AGE_SOURCE.test(value)),
  artifactSha256: z.string().regex(DIGEST_PATTERN),
  approvalDigest: z.string().regex(DIGEST_PATTERN),
}).strict();

const ageWindowSchema = z.discriminatedUnion("basis", [
  z.object({
    ageDays: z.number().int().min(0).max(MAX_TRUSTED_PEDIATRIC_AGE_DAYS),
    basis: z.literal("chronological"),
    referenceInstant: z.string().regex(STRICT_AGE_INSTANT_PATTERN).refine((value) => parseStrictAgeInstant(value) !== null),
    timeZone: z.string().refine(validTimeZone),
    algorithmVersion: z.literal("chronological-age.v1"),
    provenance: ageProvenanceSchema,
  }).strict(),
  z.object({
    ageDays: z.number().int().min(0).max(MAX_TRUSTED_PEDIATRIC_AGE_DAYS),
    basis: z.literal("corrected"),
    referenceInstant: z.string().regex(STRICT_AGE_INSTANT_PATTERN).refine((value) => parseStrictAgeInstant(value) !== null),
    timeZone: z.string().refine(validTimeZone),
    algorithmVersion: z.literal("corrected-age.v1"),
    provenance: ageProvenanceSchema,
    correctionPolicy: correctionPolicySchema,
  }).strict(),
]);

function validInput(input: unknown): input is MilestoneQueryInput {
  if (!isRecord(input)
    || Object.keys(input).some((key) => !["frameworkId", "ageWindow", "locale", "cutoff"].includes(key))
    || typeof input.frameworkId !== "string"
    || !CODE_PATTERN.test(input.frameworkId)
    || typeof input.locale !== "string"
    || !LOCALE_PATTERN.test(input.locale)
    || !isRecord(input.ageWindow)) return false;
  return ageWindowSchema.safeParse(input.ageWindow).success;
}

function validAgeWindowAt(
  ageWindow: MilestoneAgeWindow,
  cutoff: Date,
  scope: AuthorizedChildScope,
): boolean {
  if (!ageWindowSchema.safeParse(ageWindow).success) return false;
  const reference = parseStrictAgeInstant(ageWindow.referenceInstant);
  const observed = parseStrictAgeInstant(ageWindow.provenance.observedAt);
  return reference !== null
    && observed !== null
    && reference.getTime() === cutoff.getTime()
    && observed.getTime() <= cutoff.getTime()
    && ageWindow.timeZone === scope.timezone;
}

function parseStrictAgeInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !STRICT_AGE_INSTANT_PATTERN.test(value) || !isValidCalendarDate(value.slice(0, 10))) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function expectedLocale(country: AuthorizedChildScope["countryOfCare"]): "es-CO" | "en-US" {
  return country === "CO" ? "es-CO" : "en-US";
}

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex;
}

function isDigest(value: unknown): value is Sha256Hex {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function sourceSort(left: DevelopmentSourceProvenance, right: DevelopmentSourceProvenance): number {
  return left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256);
}

function sourceEvidence(sources: readonly DevelopmentSourceProvenance[]): Readonly<{
  sourceDigest: Sha256Hex;
  sourceDigests: readonly Sha256Hex[];
  licenseDigest: Sha256Hex;
}> | null {
  if (sources.length === 0) return null;
  const ordered = [...sources].sort(sourceSort);
  const sourceIds = new Set<string>();
  const artifactDigests = new Set<string>();
  for (const source of ordered) {
    if (!isDigest(source.artifactSha256)
      || typeof source.sourceId !== "string"
      || typeof source.sourceVersion !== "string"
      || typeof source.sourceUri !== "string"
      || typeof source.license !== "string"
      || typeof source.retrievedAt !== "string"
      || !CODE_PATTERN.test(source.sourceId)
      || !CODE_PATTERN.test(source.sourceVersion)
      || source.license.trim().length === 0
      || sourceIds.has(source.sourceId)
      || artifactDigests.has(source.artifactSha256)) return null;
    try {
      if (new URL(source.sourceUri).protocol !== "https:" || parseStrictAgeInstant(source.retrievedAt) === null) return null;
    } catch {
      return null;
    }
    sourceIds.add(source.sourceId);
    artifactDigests.add(source.artifactSha256);
  }
  return {
    sourceDigest: digest(ordered.map((source) => ({
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      sourceUri: source.sourceUri,
      artifactSha256: source.artifactSha256,
      license: source.license,
    }))),
    sourceDigests: Object.freeze(ordered.map((source) => source.artifactSha256).sort()),
    licenseDigest: digest(ordered.map((source) => source.license).sort()),
  };
}

function validEffectiveWindow(
  provenance: Readonly<{ effectiveFrom: string; effectiveUntil: string | null }>,
  cutoffDate: string,
): boolean {
  return isValidCalendarDate(provenance.effectiveFrom)
    && (provenance.effectiveUntil === null || isValidCalendarDate(provenance.effectiveUntil))
    && (provenance.effectiveUntil === null || provenance.effectiveUntil >= provenance.effectiveFrom)
    && provenance.effectiveFrom <= cutoffDate
    && (provenance.effectiveUntil === null || cutoffDate <= provenance.effectiveUntil);
}

function hasProfessionalMarker(value: string): boolean {
  return PROFESSIONAL_MARKER.test(value);
}

function hasProfessionalMetadata(
  framework: Extract<DevelopmentFrameworkResolution, { ok: true }>["value"]["framework"],
): boolean {
  return [
    framework.id,
    framework.version,
    framework.provenance.packageId,
    framework.provenance.packageVersion,
    framework.provenance.algorithmVersion,
    ...framework.provenance.sources.flatMap((source) => [source.sourceId, source.sourceVersion, source.sourceUri, source.license]),
  ].some(hasProfessionalMarker);
}

function provenanceMaterial(provenance: DevelopmentSourceProvenance): Readonly<Record<string, unknown>> {
  return {
    sourceId: provenance.sourceId,
    sourceVersion: provenance.sourceVersion,
    sourceUri: provenance.sourceUri,
    artifactSha256: provenance.artifactSha256,
    license: provenance.license,
  };
}

function frameworkResolutionIsBound(
  resolution: DevelopmentFrameworkResolution,
  input: MilestoneQueryInput,
  scope: AuthorizedChildScope,
  cutoffDate: string,
): resolution is Extract<DevelopmentFrameworkResolution, { ok: true }> {
  if (!resolution || typeof resolution !== "object" || resolution.ok !== true || !isRecord(resolution.value)) return false;
  const value = resolution.value;
  const parsed = developmentFrameworkSchema.safeParse(value.framework);
  if (!parsed.success || parsed.data.audience !== "caregiver") return false;
  const framework = parsed.data as unknown as Extract<DevelopmentFrameworkResolution, { ok: true }>["value"]["framework"];
  if (framework.kind !== "caregiver_education" && framework.kind !== "caregiver_observation") return false;
  if (value.audience !== "caregiver"
    || value.kind !== framework.kind
    || value.id !== input.frameworkId
    || framework.id !== input.frameworkId
    || value.version !== framework.version
    || framework.provenance.packageId !== input.frameworkId
    || framework.provenance.packageVersion !== framework.version
    || framework.provenance.jurisdiction !== scope.countryOfCare
    || framework.provenance.locale !== input.locale
    || input.locale !== expectedLocale(scope.countryOfCare)
    || framework.disclaimer !== CAREGIVER_MILESTONE_DISCLAIMER
    || hasProfessionalMetadata(framework)
    || !validEffectiveWindow(framework.provenance, cutoffDate)) return false;

  const source = sourceEvidence(framework.provenance.sources);
  if (source === null) return false;
  const artifactDigest = computeDevelopmentFrameworkArtifactSha256(framework);
  if (!isDigest(value.packageDigest)
    || !isDigest(value.sourceDigest)
    || !isDigest(value.licenseDigest)
    || !isDigest(value.artifactDigest)
    || !isDigest(value.algorithmDigest)
    || !isDigest(value.fixtureDigest)
    || !isDigest(value.rightsDigest)
    || !isDigest(value.approvalDigest)
    || !isDigest(value.approvalRecordDigest)
    || !isDigest(value.digest)
    || !Array.isArray(value.sourceDigests)
    || value.sourceDigests.some((item) => !isDigest(item))
    || value.artifactDigest !== artifactDigest
    || framework.provenance.artifactSha256 !== artifactDigest
    || value.sourceDigest !== source.sourceDigest
    || value.licenseDigest !== source.licenseDigest
    || canonicalize(value.sourceDigests) !== canonicalize(source.sourceDigests)
    || value.fixtureDigest !== framework.provenance.fixturesSha256
    || value.rightsDigest !== framework.provenance.rightsSha256
    || value.approvalDigest !== framework.provenance.approvalDigest
    || value.approvalRecordDigest !== CONVEYED_APPROVAL_RECORD_SHA256
    || value.algorithmDigest !== digest({ algorithmVersion: framework.provenance.algorithmVersion })
    || value.packageDigest !== digest({
      packageId: framework.provenance.packageId,
      packageVersion: framework.provenance.packageVersion,
      jurisdiction: framework.provenance.jurisdiction,
      locale: framework.provenance.locale,
      effectiveFrom: framework.provenance.effectiveFrom,
      effectiveUntil: framework.provenance.effectiveUntil,
    })) return false;

  const withoutDigest = { ...value } as Record<string, unknown>;
  delete withoutDigest.digest;
  if (digest(withoutDigest) !== value.digest) return false;

  const frameworkProvenanceCanonical = canonicalize(framework.provenance);
  const itemIds = new Set<string>();
  return framework.items.every((item) => {
    if (itemIds.has(item.id)) return false;
    itemIds.add(item.id);
    if (hasProfessionalMarker(item.id) || hasProfessionalMarker(item.title) || hasProfessionalMarker(item.caregiverCopy)) return false;
    if (canonicalize(item.provenance) !== frameworkProvenanceCanonical) return false;
    return item.provenance.sources.every((itemSource) => !hasProfessionalMarker(itemSource.sourceId)
      && !hasProfessionalMarker(itemSource.sourceVersion)
      && !hasProfessionalMarker(itemSource.sourceUri)
      && !hasProfessionalMarker(itemSource.license));
  });
}

function projectMilestones(
  framework: Extract<DevelopmentFrameworkResolution, { ok: true }>["value"]["framework"],
  ageDays: number,
): readonly MilestoneRow[] | null {
  if (framework.items.length === 0) return null;
  const rows: MilestoneRow[] = [];
  for (const item of framework.items) {
    const parsed = caregiverMilestoneItemSchema.safeParse(item);
    if (!parsed.success) return null;
    const milestone = parsed.data as CaregiverMilestoneItem;
    if (ageDays < milestone.minAgeDays || (milestone.maxAgeDays !== null && ageDays > milestone.maxAgeDays)) continue;
    const citations = Object.freeze([...milestone.provenance.sources].sort(sourceSort)) as readonly MilestoneCitation[];
    rows.push(Object.freeze({
      id: milestone.id,
      domain: milestone.domain,
      title: milestone.title,
      text: milestone.caregiverCopy,
      citations,
    }));
  }
  rows.sort((left, right) => left.id.localeCompare(right.id)
    || left.domain.localeCompare(right.domain)
    || left.title.localeCompare(right.title)
    || left.text.localeCompare(right.text));
  return Object.freeze(rows);
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function createMilestoneQuery(
  dependencies: MilestoneQueryDependencies,
  options: MilestoneQueryOptions = {},
): MilestoneQuery {
  const now = options.now ?? (() => new Date());
  return Object.freeze({
    async execute(scope: AuthorizedChildScope, input: MilestoneQueryInput): Promise<MilestoneQueryResult> {
      try {
        if (!validInput(input)) return FAILURE;
        const cutoff = normalizeCutoff(input.cutoff);
        const requestNow = normalizeCutoff(now());
        if (cutoff === null || requestNow === null || !validScopeAt(scope, requestNow.date)) return FAILURE;

        const freshScope = await dependencies.accessRevalidator.validate(scope, requestNow.iso);
        if (freshScope === null
          || freshScope === undefined
          || !sameAuthorizedChildScope(scope, freshScope)
          || freshScope.countryOfCare !== scope.countryOfCare
          || freshScope.timezone !== scope.timezone
          || freshScope.permissions.some((permission) => !scope.permissions.includes(permission))
          || !validScopeAt(freshScope, requestNow.date)) return FAILURE;
        if (input.locale !== expectedLocale(freshScope.countryOfCare)) return FAILURE;

        const trustedAge = await dependencies.ageEvidencePort.resolve(freshScope, {
          basis: input.ageWindow.basis,
          cutoff: cutoff.iso,
          timeZone: freshScope.timezone,
        });
        if (trustedAge === null
          || !validAgeWindowAt(trustedAge, cutoff.date, freshScope)
          || canonicalize(trustedAge) !== canonicalize(input.ageWindow)) return FAILURE;

        const cutoffDate = localCalendarDate(cutoff.date, freshScope.timezone);
        if (cutoffDate === null) return FAILURE;
        const resolution = await dependencies.frameworkResolver.resolve(freshScope, {
          frameworkId: input.frameworkId,
          locale: input.locale,
          cutoff: cutoff.iso,
        });
        if (resolution === null || !frameworkResolutionIsBound(resolution, input, freshScope, cutoffDate)) return FAILURE;

        const rows = projectMilestones(resolution.value.framework, trustedAge.ageDays);
        if (rows === null) return FAILURE;
        const result: MilestoneQuerySuccess = {
          ok: true,
          status: "available",
          frameworkId: input.frameworkId,
          locale: input.locale,
          milestones: rows,
          disclaimer: CAREGIVER_MILESTONE_DISCLAIMER,
          digest: digest({
            algorithmVersion: "development-milestone-query.v1",
            frameworkId: input.frameworkId,
            locale: input.locale,
            cutoff: cutoff.iso,
            ageWindow: trustedAge,
            milestones: rows,
            disclaimer: CAREGIVER_MILESTONE_DISCLAIMER,
          }),
        };
        return deepFreeze(result);
      } catch {
        return FAILURE;
      }
    },
  });
}
