import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { AccessDenied } from "../../../agent/lib/access/access-denied.ts";

import type { GrowthAssessmentResult, MeasurementCommand, NormalizedMeasurementValue, ConfirmedMeasurement, MeasurementType } from "./types.ts";

export type ConfirmationEvidence = Readonly<{
  confirmationSha256: string;
  expiresAt: string;
}>;

export type GrowthAssessmentPersistence = Readonly<{
  rulePackId: string;
  algorithmId: string;
  result: GrowthAssessmentResult;
}>;

export type RecordConfirmedInput = Readonly<{
  command: MeasurementCommand;
  normalized: NormalizedMeasurementValue;
  idempotencyKey: string;
  inputFingerprint: string;
  confirmation: ConfirmationEvidence;
  assessments: readonly GrowthAssessmentPersistence[];
  hmacKeyId?: string;
  capturePolicyId?: string;
  capturePolicyVersion?: string;
  supersedesMeasurementId?: string;
  supersessionReason?: string;
}>;

export type PersistedMeasurementCandidate = Readonly<{
  measurementType: MeasurementType;
  occurredAt: string;
  localDate: string;
  normalizedValue: string;
  normalizedUnit: "kg" | "cm";
  measurementMethod: string;
  inputFingerprint: string;
}>;

export type RepositoryConflict = Readonly<{
  code: "IDEMPOTENCY_CONFLICT" | "SUPERSESSION_CONFLICT" | "CONFIRMATION_INVALID";
  requestId: string;
}>;

export type RecordConfirmedResult = Readonly<{
  outcome: "created" | "idempotent_replay";
  measurementId: string;
  assessmentIds: readonly string[];
}>;

export type RepositoryAccessResult<T> = T | AccessDenied | RepositoryConflict;

export type AnthropometryRepository = Readonly<{
  recordConfirmed: (scope: AuthorizedChildScope, input: RecordConfirmedInput, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<RecordConfirmedResult>>;
  findByIdempotency: (scope: AuthorizedChildScope, idempotencyKey: string, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<Readonly<{ measurementId: string; inputFingerprint: string } | null>>>;
  findLikelyDuplicates: (scope: AuthorizedChildScope, candidate: PersistedMeasurementCandidate, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<readonly Readonly<{ id: string; inputFingerprint: string }>[]>>;
  getConfirmed: (scope: AuthorizedChildScope, measurementId: string, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<ConfirmedMeasurement | null>>;
  listCompanions: (scope: AuthorizedChildScope, input: Readonly<{ measurementType: "recumbent_length" | "standing_height"; occurredAt: string; windowDays?: number }>, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<readonly ConfirmedMeasurement[]>>;
  supersede: (scope: AuthorizedChildScope, previousMeasurementId: string, input: RecordConfirmedInput, requestId?: string, signal?: AbortSignal) => Promise<RepositoryAccessResult<RecordConfirmedResult>>;
}>;

export type GrowthAssessmentForRepository = GrowthAssessmentPersistence;
