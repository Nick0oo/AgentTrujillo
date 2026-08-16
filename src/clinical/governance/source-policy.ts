import { z } from "zod";

import {
  clinicalSourceCandidateSchema,
  isIsoDate,
  isIsoInstant,
} from "./source-schema";
import {
  normalizeAuthorityCode,
  SourceValidationError,
  type ClinicalAuthority,
  type ClinicalDomain,
  type ClinicalSourceCandidate,
  type ClinicalSourceReference,
  type CountryCode,
  type Sha256Hex,
  type SourceReviewStatus,
  type SourceValidationOptions,
  type SourceValidationRejected,
  type SourceValidationResult,
} from "./source-types";

export { clinicalSourceCandidateSchema } from "./source-schema";
export type {
  ClinicalAuthority,
  ClinicalDomain,
  ClinicalSourceCandidate,
  ClinicalSourceReference,
  CountryCode,
  Sha256Hex,
  SourceReviewStatus,
  SourceValidationAccepted,
  SourceValidationErrorCode,
  SourceValidationOptions,
  SourceValidationRejected,
  SourceValidationResult,
  SourceValidationStatus,
} from "./source-types";
export { SourceValidationError } from "./source-types";

const PRIMARY_AUTHORITY_POLICY: Readonly<Record<ClinicalAuthority, Readonly<Partial<Record<CountryCode, readonly ClinicalDomain[]>>>>> = {
  MINSALUD_PAI: {
    CO: ["immunization"],
  },
  CDC_ACIP: {
    US: ["immunization"],
  },
  WHO: {
    GLOBAL: ["growth", "immunization", "development", "nutrition", "emergency"],
  },
};

const AUTHORITY_ALIASES: Readonly<Record<string, ClinicalAuthority>> = {
  MINSALUD: "MINSALUD_PAI",
  MINSALUD_PAI: "MINSALUD_PAI",
  MINISTERIO_DE_SALUD_Y_PROTECCION_SOCIAL: "MINSALUD_PAI",
  MINISTERIO_DE_SALUD_Y_PROTECCION_SOCIAL_PAI: "MINSALUD_PAI",
  PAI: "MINSALUD_PAI",
  CDC: "CDC_ACIP",
  CDC_ACIP: "CDC_ACIP",
  WHO: "WHO",
  WORLD_HEALTH_ORGANIZATION: "WHO",
};

const AUTHORITY_HOSTS: Readonly<Record<ClinicalAuthority, readonly string[]>> = {
  MINSALUD_PAI: ["minsalud.gov.co"],
  CDC_ACIP: ["cdc.gov"],
  WHO: ["who.int"],
};

function asRecord(candidate: unknown): Record<string, unknown> | null {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function rejected(code: SourceValidationRejected["code"], field?: string): SourceValidationRejected {
  const error = new SourceValidationError(code, field);
  return Object.freeze({ ok: false as const, code, error });
}

function canonicalAuthority(value: unknown): ClinicalAuthority | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeAuthorityCode(value);
  return AUTHORITY_ALIASES[normalized] ?? null;
}

function canonicalJurisdiction(value: unknown): CountryCode | null {
  if (typeof value !== "string") return null;
  return value === "CO" || value === "US" || value === "GLOBAL" ? value : null;
}

function canonicalDomain(value: unknown): ClinicalDomain | null {
  if (typeof value !== "string") return null;
  return value === "growth"
    || value === "immunization"
    || value === "medication"
    || value === "development"
    || value === "nutrition"
    || value === "emergency"
    ? value
    : null;
}

function isHostnameUnder(hostname: string, authorityHost: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === authorityHost || host.endsWith(`.${authorityHost}`);
}

function parseSourceUri(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function hostMatchesAuthority(uri: URL, authority: ClinicalAuthority): boolean {
  return AUTHORITY_HOSTS[authority].some((host) => isHostnameUnder(uri.hostname, host));
}

function resolveNow(value: Date | string | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  return Date.now();
}

function getOptions(options: SourceValidationOptions | readonly ClinicalSourceReference[] | undefined): SourceValidationOptions {
  if (Array.isArray(options)) return { existingSources: options as readonly ClinicalSourceReference[] };
  return options === undefined ? {} : options as SourceValidationOptions;
}

function isDuplicateVersion(
  sourceUri: string,
  retrievedAt: string,
  existingSources: readonly Pick<ClinicalSourceReference, "sourceUri" | "retrievedAt">[] | undefined,
): boolean {
  return existingSources?.some((source) => source.sourceUri === sourceUri && source.retrievedAt === retrievedAt) ?? false;
}

function normalizeOptionalDate(value: unknown): string | null {
  return value === undefined || value === null ? null : value as string;
}

export function isPrimaryAuthority(
  authority: string,
  jurisdiction: string,
  domain: string,
): boolean {
  const canonical = canonicalAuthority(authority);
  const country = canonicalJurisdiction(jurisdiction);
  const clinicalDomain = canonicalDomain(domain);
  if (!canonical || !country || !clinicalDomain) return false;
  return PRIMARY_AUTHORITY_POLICY[canonical][country]?.includes(clinicalDomain) ?? false;
}

export function validateClinicalSource(
  candidate: unknown,
  options?: SourceValidationOptions | readonly ClinicalSourceReference[],
): SourceValidationResult {
  const raw = asRecord(candidate);
  if (!raw) return rejected("INVALID_SOURCE");

  const authority = canonicalAuthority(raw.authority);
  if (!authority) return rejected("UNSUPPORTED_AUTHORITY", "authority");

  const jurisdiction = canonicalJurisdiction(raw.jurisdiction);
  if (!jurisdiction) return rejected("UNSUPPORTED_JURISDICTION", "jurisdiction");

  const domain = canonicalDomain(raw.domain);
  if (!domain) return rejected("UNSUPPORTED_DOMAIN", "domain");

  const authorityPolicy = PRIMARY_AUTHORITY_POLICY[authority];
  if (!authorityPolicy[jurisdiction]) return rejected("AUTHORITY_JURISDICTION_MISMATCH", "jurisdiction");
  if (!authorityPolicy[jurisdiction]?.includes(domain)) return rejected("AUTHORITY_DOMAIN_MISMATCH", "domain");

  if (typeof raw.sourceUri !== "string" || raw.sourceUri.length === 0) {
    return rejected("SOURCE_URI_INVALID", "sourceUri");
  }
  const sourceUri = parseSourceUri(raw.sourceUri);
  if (!sourceUri) return rejected("SOURCE_URI_INVALID", "sourceUri");
  if (sourceUri.protocol !== "https:") return rejected("SOURCE_URI_NOT_HTTPS", "sourceUri");
  if (!hostMatchesAuthority(sourceUri, authority)) return rejected("SOURCE_HOST_MISMATCH", "sourceUri");

  if (raw.license === undefined || raw.license === null || raw.license === "") {
    return rejected("MISSING_LICENSE", "license");
  }
  if (typeof raw.license !== "string" || raw.license.trim().length === 0) {
    return rejected("INVALID_LICENSE", "license");
  }

  if (raw.artifactSha256 === undefined || raw.artifactSha256 === null || raw.artifactSha256 === "") {
    return rejected("MISSING_ARTIFACT_DIGEST", "artifactSha256");
  }
  if (typeof raw.artifactSha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.artifactSha256)) {
    return rejected("INVALID_ARTIFACT_DIGEST", "artifactSha256");
  }

  if (typeof raw.retrievedAt !== "string" || !isIsoInstant(raw.retrievedAt)) {
    return rejected("INVALID_RETRIEVAL_INSTANT", "retrievedAt");
  }
  const retrievalTime = Date.parse(raw.retrievedAt);
  const now = resolveNow(getOptions(options).now);
  if (!Number.isFinite(now) || retrievalTime >= now) return rejected("RETRIEVAL_IN_FUTURE", "retrievedAt");

  for (const field of ["publishedAt", "effectiveFrom", "effectiveUntil"] as const) {
    const value = raw[field];
    if (value !== undefined && value !== null && (typeof value !== "string" || !isIsoDate(value))) {
      return rejected(field === "publishedAt" ? "INVALID_PUBLICATION_DATE" : "INVALID_EFFECTIVE_DATE", field);
    }
  }
  if (typeof raw.effectiveFrom === "string"
    && typeof raw.effectiveUntil === "string"
    && raw.effectiveUntil < raw.effectiveFrom) {
    return rejected("INVALID_EFFECTIVE_WINDOW", "effectiveUntil");
  }

  const rawStatus = raw.status ?? "candidate";
  if (typeof rawStatus !== "string" || !(["candidate", "reviewed", "approved", "retired"] as const).includes(rawStatus as SourceReviewStatus)) {
    return rejected("INVALID_REVIEW_STATUS", "status");
  }
  const status = rawStatus as SourceReviewStatus;
  if (status === "approved") return rejected("APPROVED_STATUS_NOT_ASSIGNABLE", "status");

  const parsed = clinicalSourceCandidateSchema.safeParse({
    ...raw,
    authority,
    jurisdiction,
    domain,
    status,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return rejected(issue?.path[0] === "sourceUri" ? "SOURCE_URI_INVALID" : "INVALID_SOURCE", String(issue?.path[0] ?? "source"));
  }

  const validated = parsed.data;
  const parsedOptions = getOptions(options);
  if (isDuplicateVersion(validated.sourceUri, validated.retrievedAt, parsedOptions.existingSources)) {
    return rejected("DUPLICATE_SOURCE_VERSION", "sourceUri");
  }

  const source: ClinicalSourceReference = Object.freeze({
    authority,
    jurisdiction,
    domain,
    title: validated.title,
    sourceUri: validated.sourceUri,
    citation: validated.citation ?? null,
    publishedAt: normalizeOptionalDate(validated.publishedAt),
    retrievedAt: validated.retrievedAt,
    effectiveFrom: normalizeOptionalDate(validated.effectiveFrom),
    effectiveUntil: normalizeOptionalDate(validated.effectiveUntil),
    license: validated.license,
    artifactSha256: validated.artifactSha256 as Sha256Hex,
    status,
  });

  return Object.freeze({
    ok: true as const,
    status: status === "retired" ? "needs_review" as const : "accepted" as const,
    source,
  });
}

export { PRIMARY_AUTHORITY_POLICY };
