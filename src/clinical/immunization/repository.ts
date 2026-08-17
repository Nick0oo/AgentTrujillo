import type { AccessDenied } from "../../../agent/lib/access/access-denied.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { ConfirmedAdministrationCandidate } from "./validation.ts";
import type { VaccinationAssessment } from "./types.ts";

export type ImmunizationRepositoryFailure = Readonly<{ ok: false; code: "CLOUD_PERSISTENCE_ERROR" | "IDEMPOTENCY_CONFLICT" | "CONFIRMATION_INVALID"; requestId: string }>;
export type ImmunizationRepositoryResult<T> = T | AccessDenied | ImmunizationRepositoryFailure;
export type RecordConfirmedAdministrationInput = Readonly<{ candidate: ConfirmedAdministrationCandidate; idempotencyKey: string; inputFingerprint: string; requestId?: string; supersedesAdministrationId?: string; supersessionReason?: string }>;
export type RecordConfirmedAdministrationResult = Readonly<{ outcome: "created" | "idempotent_replay"; administrationId: string }>;
export type VaccinationAssessmentWrite = Readonly<{ scheduleId: string; assessment: VaccinationAssessment; inputFingerprint: string; requestId?: string }>;
export type PersistedVaccinationAssessment = Readonly<{ outcome: "created" | "idempotent_replay"; assessmentId: string }>;

export type ImmunizationRepository = Readonly<{
  recordConfirmed: (scope: AuthorizedChildScope, input: RecordConfirmedAdministrationInput, signal?: AbortSignal) => Promise<ImmunizationRepositoryResult<RecordConfirmedAdministrationResult>>;
  recordConfirmedAdministration: (scope: AuthorizedChildScope, input: RecordConfirmedAdministrationInput, signal?: AbortSignal) => Promise<ImmunizationRepositoryResult<RecordConfirmedAdministrationResult>>;
  supersedeAdministration: (scope: AuthorizedChildScope, input: RecordConfirmedAdministrationInput, signal?: AbortSignal) => Promise<ImmunizationRepositoryResult<RecordConfirmedAdministrationResult>>;
  saveAssessment: (scope: AuthorizedChildScope, input: VaccinationAssessmentWrite, signal?: AbortSignal) => Promise<ImmunizationRepositoryResult<PersistedVaccinationAssessment>>;
}>;
