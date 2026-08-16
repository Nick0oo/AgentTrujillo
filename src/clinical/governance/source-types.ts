export type ClinicalDomain =
  | "growth"
  | "immunization"
  | "medication"
  | "development"
  | "nutrition"
  | "emergency";

export type CountryCode = "CO" | "US" | "GLOBAL";
export type ClinicalJurisdiction = CountryCode;

export type ClinicalAuthority = "MINSALUD_PAI" | "CDC_ACIP" | "WHO";

declare const sha256HexBrand: unique symbol;
export type Sha256Hex = string & { readonly [sha256HexBrand]: true };

export type SourceReviewStatus = "candidate" | "reviewed" | "approved" | "retired";
export type SourceValidationStatus = "accepted" | "needs_review";

export type ClinicalSourceCandidate = Readonly<{
  authority: string;
  jurisdiction: string;
  domain: string;
  title: string;
  sourceUri: string;
  citation?: string | null;
  publishedAt?: string | null;
  retrievedAt: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  license: string;
  artifactSha256: string;
  status?: SourceReviewStatus;
}>;

export type ClinicalSourceReference = Readonly<{
  id?: string;
  sourceId?: string;
  authority: ClinicalAuthority;
  jurisdiction: CountryCode;
  domain: ClinicalDomain;
  title: string;
  sourceUri: string;
  citation: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  license: string;
  artifactSha256: Sha256Hex;
  status: SourceReviewStatus;
}>;

export type SourceValidationErrorCode =
  | "INVALID_SOURCE"
  | "UNSUPPORTED_AUTHORITY"
  | "UNSUPPORTED_JURISDICTION"
  | "UNSUPPORTED_DOMAIN"
  | "AUTHORITY_JURISDICTION_MISMATCH"
  | "AUTHORITY_DOMAIN_MISMATCH"
  | "SOURCE_URI_INVALID"
  | "SOURCE_URI_NOT_HTTPS"
  | "SOURCE_HOST_MISMATCH"
  | "MISSING_LICENSE"
  | "INVALID_LICENSE"
  | "MISSING_ARTIFACT_DIGEST"
  | "INVALID_ARTIFACT_DIGEST"
  | "INVALID_RETRIEVAL_INSTANT"
  | "RETRIEVAL_IN_FUTURE"
  | "INVALID_PUBLICATION_DATE"
  | "INVALID_EFFECTIVE_DATE"
  | "INVALID_EFFECTIVE_WINDOW"
  | "INVALID_REVIEW_STATUS"
  | "APPROVED_STATUS_NOT_ASSIGNABLE"
  | "DUPLICATE_SOURCE_VERSION";

export class SourceValidationError extends Error {
  readonly code: SourceValidationErrorCode;
  readonly field?: string;

  constructor(code: SourceValidationErrorCode, field?: string) {
    super(code);
    this.name = "SourceValidationError";
    this.code = code;
    this.field = field;
  }
}

export type SourceValidationOptions = Readonly<{
  now?: Date | string;
  existingSources?: readonly Pick<ClinicalSourceReference, "sourceUri" | "retrievedAt">[];
}>;

export type SourceValidationAccepted = Readonly<{
  ok: true;
  status: SourceValidationStatus;
  source: ClinicalSourceReference;
}>;

export type SourceValidationRejected = Readonly<{
  ok: false;
  code: SourceValidationErrorCode;
  error: SourceValidationError;
}>;

export type SourceValidationResult = SourceValidationAccepted | SourceValidationRejected;

export function normalizeAuthorityCode(value: string): string {
  return value
    .trim()
    .replace(/[\/\-]+/g, "_")
    .replace(/\s+/g, "_")
    .toUpperCase();
}

