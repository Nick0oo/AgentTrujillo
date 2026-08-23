import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import {
  developmentFrameworkSchema,
  type DevelopmentFramework,
} from "./types.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

const DIGEST = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_OFFSET_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;
const LOCALE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;
const FORBIDDEN_CONSUMER_MARKER = /\b(?:ead\s*[-–—]?\s*3|professional[\s_-]+instrument|scor(?:e|es|ing)|cut[\s_-]*off|classif(?:ication|ications)|examiners?|diagnos(?:e|ed|es|is|tic)|delay(?:ed|s)?|autism|abnormal|normal(?:ity|ly)?|pass|fail)\b/i;

export const CONVEYED_APPROVAL_RECORD_SHA256 = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
export const CAREGIVER_FRAMEWORK_DISCLAIMER = "Communication aid only; not a developmental standard, screening tool, diagnostic tool, or proof of normality.";

type DevelopmentCountry = "CO" | "US";
type DevelopmentJurisdiction = DevelopmentCountry;
export type CaregiverDevelopmentFramework = Extract<DevelopmentFramework, { audience: "caregiver" }>;
type CaregiverFramework = CaregiverDevelopmentFramework;

export type DevelopmentFrameworkSelectionContext = Readonly<{
  countryOfCare: DevelopmentCountry;
  locale: string;
  asOf: Date | string;
  timeZone?: string;
}>;

export type DevelopmentFrameworkCandidate = Readonly<{
  framework: DevelopmentFramework;
  release: Readonly<{
    jurisdiction: DevelopmentJurisdiction;
    locale: string;
    version: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    status: "draft" | "released" | "retired" | "revoked";
    current: boolean;
    revoked: boolean;
  }>;
  approval: Readonly<{
    status: "approved" | "withdrawn" | "revoked";
    current: boolean;
    digest: Sha256Hex;
    recordDigest: Sha256Hex;
    approvedArtifactSha256: Sha256Hex;
    packageId: string;
    packageVersion: string;
    revoked?: boolean;
  }>;
  evidence: Readonly<{
    packageDigest: Sha256Hex;
    sourceDigest: Sha256Hex;
    licenseDigest: Sha256Hex;
    artifactDigest: Sha256Hex;
    algorithmDigest: Sha256Hex;
    fixtureDigest: Sha256Hex;
    rightsDigest: Sha256Hex;
    disclaimerDigest: Sha256Hex;
  }>;
}>;

export type DevelopmentFrameworkUnavailableReason =
  | "INVALID_CONTEXT"
  | "NO_CANDIDATE"
  | "PROFESSIONAL_ONLY"
  | "JURISDICTION_MISMATCH"
  | "LOCALE_MISMATCH"
  | "EFFECTIVE_WINDOW_INVALID"
  | "NOT_RELEASED"
  | "NOT_CURRENT"
  | "REVOKED"
  | "SOURCE_UNAVAILABLE"
  | "LICENSE_UNAVAILABLE"
  | "RIGHTS_UNAVAILABLE"
  | "APPROVAL_UNAVAILABLE"
  | "CHECKSUM_MISMATCH"
  | "DISCLAIMER_DRIFT"
  | "AMBIGUOUS_CANDIDATE";

export type DevelopmentFrameworkResolution =
  | Readonly<{
    ok: true;
    value: Readonly<{
      framework: CaregiverFramework;
      audience: "caregiver";
      kind: CaregiverFramework["kind"];
      id: string;
      version: string;
      packageDigest: Sha256Hex;
      sourceDigest: Sha256Hex;
      sourceDigests: readonly Sha256Hex[];
      licenseDigest: Sha256Hex;
      artifactDigest: Sha256Hex;
      algorithmDigest: Sha256Hex;
      fixtureDigest: Sha256Hex;
      rightsDigest: Sha256Hex;
      approvalDigest: Sha256Hex;
      approvalRecordDigest: Sha256Hex;
      digest: Sha256Hex;
    }>;
  }>
  | Readonly<{
    ok: false;
    code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE";
    reason: DevelopmentFrameworkUnavailableReason;
    digest: Sha256Hex;
  }>;

type SelectionDate = Readonly<{ date: string; instant: string }>;

function hash(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

/** Canonical immutable framework bytes: the complete caregiver framework, omitting only its self-referential package artifact digests. */
function canonicalFrameworkArtifactPayload(framework: CaregiverFramework): unknown {
  const { artifactSha256: _frameworkArtifactSha256, ...frameworkProvenance } = framework.provenance;
  const sources = [...frameworkProvenance.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256));
  return {
    ...framework,
    provenance: { ...frameworkProvenance, sources },
    items: [...framework.items].sort((left, right) => left.id.localeCompare(right.id)).map((item) => {
      const { artifactSha256: _itemArtifactSha256, ...itemProvenance } = item.provenance;
      return { ...item, provenance: itemProvenance };
    }),
  };
}

export function computeDevelopmentFrameworkArtifactSha256(framework: CaregiverFramework): Sha256Hex {
  return hash(canonicalFrameworkArtifactPayload(framework));
}

function isDigest(value: unknown): value is Sha256Hex {
  return typeof value === "string" && DIGEST.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
  return Object.freeze(value);
}

function selectionDate(context: DevelopmentFrameworkSelectionContext): SelectionDate | null {
  if (!context || typeof context !== "object" || typeof context.locale !== "string" || !LOCALE.test(context.locale)) return null;
  const asOf = context.asOf;
  if (asOf instanceof Date && !Number.isFinite(asOf.getTime())) return null;
  if (typeof asOf === "string" && isIsoDate(asOf)) {
    return { date: asOf, instant: `${asOf}T00:00:00.000Z` };
  }
  if (asOf instanceof Date) {
    const instant = new Date(asOf.getTime());
    return selectionDateFromInstant(instant, context.timeZone);
  }
  const instant = parseOffsetInstant(asOf);
  if (!instant) return null;
  return selectionDateFromInstant(instant, context.timeZone);
}

function parseOffsetInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_OFFSET_INSTANT.test(value) || !isIsoDate(value.slice(0, 10))) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) ? instant : null;
}

function selectionDateFromInstant(instant: Date, timeZone = "UTC"): SelectionDate | null {
  if (!Number.isFinite(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
    const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = `${fields.year}-${fields.month}-${fields.day}`;
    return isIsoDate(date) ? { date, instant: instant.toISOString() } : null;
  } catch {
    return null;
  }
}

function failure(reason: DevelopmentFrameworkUnavailableReason, context: unknown): DevelopmentFrameworkResolution {
  return {
    ok: false,
    code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE",
    reason,
    digest: hash({ code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE", reason, context }),
  };
}

function candidateKey(candidate: DevelopmentFrameworkCandidate): string {
  const framework = candidate?.framework;
  const provenance = framework && typeof framework === "object" && "provenance" in framework
    ? (framework as Extract<DevelopmentFramework, { audience: "caregiver" }>).provenance
    : undefined;
  const release = candidate?.release;
  return [
    provenance?.packageId ?? "",
    provenance?.packageVersion ?? "",
    release?.jurisdiction ?? "",
    release?.locale ?? "",
    release?.effectiveFrom ?? "",
    release?.effectiveUntil ?? "",
    framework && typeof framework === "object" && "kind" in framework ? framework.kind : "",
  ].join("|");
}

function sourceEvidence(framework: CaregiverFramework): Readonly<{
  sourceDigest: Sha256Hex;
  sourceDigests: readonly Sha256Hex[];
  licenseDigest: Sha256Hex;
}> | null {
  const sources = framework.provenance.sources;
  if (sources.length === 0) return null;
  const summaries = sources.map((source) => {
    if (!source.sourceId.trim() || !source.sourceVersion.trim() || !source.license.trim() || !isDigest(source.artifactSha256)) return null;
    try {
      if (new URL(source.sourceUri).protocol !== "https:") return null;
      if (!Number.isFinite(Date.parse(source.retrievedAt))) return null;
    } catch {
      return null;
    }
    return {
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      sourceUri: source.sourceUri,
      artifactSha256: source.artifactSha256,
      license: source.license,
    };
  });
  if (summaries.some((summary) => summary === null)) return null;
  const ordered = summaries.filter((summary): summary is NonNullable<typeof summary> => summary !== null)
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256));
  return {
    sourceDigest: hash(ordered),
    sourceDigests: Object.freeze(ordered.map((source) => source.artifactSha256).sort()),
    licenseDigest: hash(ordered.map((source) => source.license).sort()),
  };
}

function provenanceDigest(provenance: CaregiverFramework["provenance"]): Sha256Hex {
  return hash({
    ...provenance,
    sources: [...provenance.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256)),
  });
}

function itemEvidenceIsBound(framework: CaregiverFramework): boolean {
  const selectedProvenance = provenanceDigest(framework.provenance);
  const ids = new Set<string>();
  return framework.items.every((item) => {
    if (ids.has(item.id) || provenanceDigest(item.provenance) !== selectedProvenance) return false;
    ids.add(item.id);
    return true;
  });
}

function provenanceText(provenance: CaregiverFramework["provenance"]): readonly string[] {
  return [
    provenance.packageId,
    provenance.packageVersion,
    provenance.algorithmVersion,
    provenance.jurisdiction,
    provenance.locale,
    provenance.effectiveFrom,
    provenance.effectiveUntil ?? "",
    provenance.translation,
    ...provenance.sources.flatMap((source) => [source.sourceId, source.sourceUri, source.sourceVersion, source.license]),
  ];
}

function provenanceHasForbiddenMarker(framework: CaregiverFramework): boolean {
  return [
    ...provenanceText(framework.provenance),
    ...framework.items.flatMap((item) => provenanceText(item.provenance)),
  ].some((value) => FORBIDDEN_CONSUMER_MARKER.test(value));
}

function exactJurisdiction(
  context: DevelopmentFrameworkSelectionContext,
  release: DevelopmentFrameworkCandidate["release"],
): boolean {
  return release.jurisdiction === context.countryOfCare;
}

function validateCandidate(
  context: DevelopmentFrameworkSelectionContext,
  asOf: SelectionDate,
  candidate: DevelopmentFrameworkCandidate,
): DevelopmentFrameworkUnavailableReason | null {
  if (!candidate || !candidate.framework || !candidate.release || !candidate.approval || !candidate.evidence) return "NO_CANDIDATE";
  if (candidate.framework.kind === "professional_instrument_reference") return "PROFESSIONAL_ONLY";
  const rawProvenance = (candidate.framework as { provenance?: unknown }).provenance;
  if (rawProvenance && typeof rawProvenance === "object") {
    const raw = rawProvenance as { rightsSha256?: unknown; sources?: unknown };
    if (!isDigest(raw.rightsSha256)) return "RIGHTS_UNAVAILABLE";
    if (!Array.isArray(raw.sources) || raw.sources.length === 0) return "SOURCE_UNAVAILABLE";
    if (raw.sources.some((source) => !source || typeof source !== "object"
      || typeof (source as { license?: unknown }).license !== "string"
      || !(source as { license: string }).license.trim())) return "LICENSE_UNAVAILABLE";
  }
  const parsed = developmentFrameworkSchema.safeParse(candidate.framework);
  if (!parsed.success || parsed.data.audience !== "caregiver") return "CHECKSUM_MISMATCH";
  const framework = parsed.data as unknown as CaregiverFramework;
  if (framework.kind !== "caregiver_education" && framework.kind !== "caregiver_observation") return "PROFESSIONAL_ONLY";
  const identifiers = [framework.id, framework.provenance.packageId, ...framework.provenance.sources.map((source) => source.sourceId)];
  if (identifiers.some((value) => /\b(?:ead\s*[-–—]?\s*3|professional[\s_-]+instrument)\b/i.test(value))) return "PROFESSIONAL_ONLY";
  if (provenanceHasForbiddenMarker(framework)) return "PROFESSIONAL_ONLY";
  if (!itemEvidenceIsBound(framework)) return "CHECKSUM_MISMATCH";
  if (framework.items.some((item) => [item.id, item.title, item.caregiverCopy].some((value) => FORBIDDEN_CONSUMER_MARKER.test(value)))) return "PROFESSIONAL_ONLY";
  if (!exactJurisdiction(context, candidate.release)) return "JURISDICTION_MISMATCH";
  if (framework.provenance.jurisdiction !== candidate.release.jurisdiction) return "JURISDICTION_MISMATCH";
  if (candidate.release.locale !== context.locale || framework.provenance.locale !== candidate.release.locale) return "LOCALE_MISMATCH";
  if (!isIsoDate(candidate.release.effectiveFrom)
    || (candidate.release.effectiveUntil !== null && !isIsoDate(candidate.release.effectiveUntil))
    || (candidate.release.effectiveUntil !== null && candidate.release.effectiveUntil < candidate.release.effectiveFrom)) return "EFFECTIVE_WINDOW_INVALID";
  if (framework.provenance.effectiveFrom !== candidate.release.effectiveFrom
    || framework.provenance.effectiveUntil !== candidate.release.effectiveUntil
    || framework.provenance.packageVersion !== candidate.release.version
    || framework.version !== candidate.release.version
    || framework.id !== framework.provenance.packageId) return "CHECKSUM_MISMATCH";
  if (candidate.release.effectiveFrom > asOf.date
    || (candidate.release.effectiveUntil !== null && candidate.release.effectiveUntil < asOf.date)) return "EFFECTIVE_WINDOW_INVALID";
  if (candidate.release.revoked || candidate.release.status === "revoked") return "REVOKED";
  if (candidate.release.status !== "released") return "NOT_RELEASED";
  if (!candidate.release.current) return "NOT_CURRENT";
  const artifactDigest = computeDevelopmentFrameworkArtifactSha256(framework);
  if (framework.disclaimer !== CAREGIVER_FRAMEWORK_DISCLAIMER) return "DISCLAIMER_DRIFT";
  if (framework.provenance.artifactSha256 !== artifactDigest || candidate.evidence.artifactDigest !== artifactDigest) return "CHECKSUM_MISMATCH";
  if (candidate.approval.revoked || candidate.approval.status !== "approved" || !candidate.approval.current) return "APPROVAL_UNAVAILABLE";
  if (candidate.approval.recordDigest !== CONVEYED_APPROVAL_RECORD_SHA256
    || candidate.approval.digest !== framework.provenance.approvalDigest
    || candidate.approval.approvedArtifactSha256 !== artifactDigest
    || candidate.approval.packageId !== framework.provenance.packageId
    || candidate.approval.packageVersion !== framework.provenance.packageVersion) return "APPROVAL_UNAVAILABLE";
  if (!isDigest(candidate.approval.digest) || !isDigest(candidate.approval.recordDigest)) return "CHECKSUM_MISMATCH";
  if (framework.provenance.sources.some((source) => !source.license.trim())) return "LICENSE_UNAVAILABLE";
  const source = sourceEvidence(framework);
  if (!source) return "SOURCE_UNAVAILABLE";
  if (framework.provenance.rightsSha256 === "" || !isDigest(framework.provenance.rightsSha256)) return "RIGHTS_UNAVAILABLE";
  const expected = {
    packageDigest: hash({
      packageId: framework.provenance.packageId,
      packageVersion: framework.provenance.packageVersion,
      jurisdiction: framework.provenance.jurisdiction,
      locale: framework.provenance.locale,
      effectiveFrom: framework.provenance.effectiveFrom,
      effectiveUntil: framework.provenance.effectiveUntil,
    }),
    sourceDigest: source.sourceDigest,
    licenseDigest: source.licenseDigest,
    artifactDigest,
    algorithmDigest: hash({ algorithmVersion: framework.provenance.algorithmVersion }),
    fixtureDigest: framework.provenance.fixturesSha256,
    rightsDigest: framework.provenance.rightsSha256,
    disclaimerDigest: hash(framework.disclaimer),
  };
  if (!Object.entries(expected).every(([key, value]) => candidate.evidence[key as keyof typeof expected] === value)
    || Object.values(candidate.evidence).some((value) => !isDigest(value))) return "CHECKSUM_MISMATCH";
  return null;
}

function invalidContextDigestInput(context: unknown): Readonly<{ locale: string; asOf: string }> {
  try {
    if (!context || typeof context !== "object") return { locale: "", asOf: typeof context };
    const value = context as { locale?: unknown; asOf?: unknown };
    return {
      locale: typeof value.locale === "string" ? value.locale : "",
      asOf: typeof value.asOf === "string" ? value.asOf : value.asOf instanceof Date ? "date" : typeof value.asOf,
    };
  } catch {
    return { locale: "", asOf: "invalid" };
  }
}

export function resolveDevelopmentFramework(
  context: DevelopmentFrameworkSelectionContext,
  candidates: readonly DevelopmentFrameworkCandidate[],
): DevelopmentFrameworkResolution {
  if (!context || typeof context !== "object") return failure("INVALID_CONTEXT", {});
  const asOf = selectionDate(context);
  if (!asOf || (context.countryOfCare !== "CO" && context.countryOfCare !== "US")) return failure("INVALID_CONTEXT", invalidContextDigestInput(context));
  if (!Array.isArray(candidates) || candidates.length === 0) return failure("NO_CANDIDATE", { country: context.countryOfCare, locale: context.locale, asOf: asOf.date });
  const ordered = [...candidates].sort((left, right) => candidateKey(left).localeCompare(candidateKey(right)));
  const caregiver = ordered.filter((candidate) => candidate?.framework?.audience === "caregiver");
  if (caregiver.length === 0) return failure("PROFESSIONAL_ONLY", { country: context.countryOfCare, locale: context.locale, asOf: asOf.date });
  const eligible: Array<Readonly<{ framework: CaregiverFramework; candidate: DevelopmentFrameworkCandidate }>> = [];
  const reasons: DevelopmentFrameworkUnavailableReason[] = [];
  for (const candidate of caregiver) {
    const reason = validateCandidate(context, asOf, candidate);
    if (reason === null) {
      const parsed = developmentFrameworkSchema.parse(candidate.framework) as unknown as CaregiverFramework;
      eligible.push({ framework: parsed, candidate });
    } else {
      reasons.push(reason);
    }
  }
  if (eligible.length > 1) return failure("AMBIGUOUS_CANDIDATE", { country: context.countryOfCare, locale: context.locale, asOf: asOf.date });
  if (eligible.length === 0) {
    const priority: readonly DevelopmentFrameworkUnavailableReason[] = ["REVOKED", "APPROVAL_UNAVAILABLE", "CHECKSUM_MISMATCH", "RIGHTS_UNAVAILABLE", "SOURCE_UNAVAILABLE", "LICENSE_UNAVAILABLE", "DISCLAIMER_DRIFT", "NOT_RELEASED", "NOT_CURRENT", "EFFECTIVE_WINDOW_INVALID", "LOCALE_MISMATCH", "JURISDICTION_MISMATCH", "PROFESSIONAL_ONLY", "NO_CANDIDATE"];
    return failure(priority.find((reason) => reasons.includes(reason)) ?? "NO_CANDIDATE", { country: context.countryOfCare, locale: context.locale, asOf: asOf.date });
  }
  const selected = eligible[0];
  if (!selected) return failure("NO_CANDIDATE", { country: context.countryOfCare, locale: context.locale, asOf: asOf.date });
  const candidate = selected.candidate;
  const framework = freeze({
    ...selected.framework,
    provenance: {
      ...selected.framework.provenance,
      sources: Object.freeze([...selected.framework.provenance.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256))),
    },
    items: Object.freeze([...selected.framework.items].sort((left, right) => left.id.localeCompare(right.id))),
  });
  const evidence = candidate.evidence;
  const source = sourceEvidence(framework)!;
  const valueWithoutDigest = {
    framework,
    audience: "caregiver" as const,
    kind: framework.kind,
    id: framework.id,
    version: framework.version,
    packageDigest: evidence.packageDigest,
    sourceDigest: evidence.sourceDigest,
    sourceDigests: Object.freeze([...source.sourceDigests]),
    licenseDigest: evidence.licenseDigest,
    artifactDigest: evidence.artifactDigest,
    algorithmDigest: evidence.algorithmDigest,
    fixtureDigest: evidence.fixtureDigest,
    rightsDigest: evidence.rightsDigest,
    approvalDigest: candidate.approval.digest,
    approvalRecordDigest: candidate.approval.recordDigest,
  };
  return { ok: true, value: freeze({ ...valueWithoutDigest, digest: hash(valueWithoutDigest) }) };
}
