import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationOperation } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationIntakeRecord, MedicationIntakeState, MedicationPlanInput, MedicationPlanRecord, MedicationScheduleOccurrence } from "../../clinical/medication/types.ts";

export type MedicationPersistenceReceipt<T> = Readonly<{
  outcome: "created" | "idempotent_replay";
  value: T;
}>;

export type MedicationCommandReceipt<T> = Readonly<{
  outcome: "created" | "replayed" | "no_effect";
  value: T;
}>;

export type MedicationStore = Readonly<{
  createPlan(scope: AuthorizedChildScope, input: MedicationPlanInput, operation: MedicationOperation): Promise<MedicationPlanRecord>;
  createPlanWithOutcome(scope: AuthorizedChildScope, input: MedicationPlanInput, operation: MedicationOperation): Promise<MedicationPersistenceReceipt<MedicationPlanRecord>>;
  getPlan(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord | null>;
  listPlans(scope: AuthorizedChildScope): Promise<readonly MedicationPlanRecord[]>;
  setPlanStatus(scope: AuthorizedChildScope, planId: string, status: MedicationPlanRecord["status"], operation: MedicationOperation): Promise<MedicationPlanRecord>;
  setPlanStatusWithOutcome(scope: AuthorizedChildScope, planId: string, status: MedicationPlanRecord["status"], operation: MedicationOperation): Promise<MedicationPersistenceReceipt<MedicationPlanRecord>>;
  supersedePlan(scope: AuthorizedChildScope, planId: string, input: MedicationPlanInput, operation: MedicationOperation): Promise<MedicationPlanRecord>;
  listOccurrences(scope: AuthorizedChildScope, planId: string, from: string, to: string): Promise<readonly MedicationScheduleOccurrence[]>;
  putOccurrences(scope: AuthorizedChildScope, occurrences: readonly MedicationScheduleOccurrence[], operation: MedicationOperation): Promise<readonly MedicationScheduleOccurrence[]>;
  putOccurrencesWithOutcome(scope: AuthorizedChildScope, occurrences: readonly MedicationScheduleOccurrence[], operation: MedicationOperation): Promise<MedicationPersistenceReceipt<readonly MedicationScheduleOccurrence[]>>;
  getOccurrence(scope: AuthorizedChildScope, occurrenceId: string): Promise<MedicationScheduleOccurrence | null>;
  createIntake(scope: AuthorizedChildScope, value: Omit<MedicationIntakeRecord, "id" | "recordedBy">, operation: MedicationOperation): Promise<MedicationIntakeRecord>;
  getIntake(scope: AuthorizedChildScope, intakeId: string): Promise<MedicationIntakeRecord | null>;
  listIntakes(scope: AuthorizedChildScope, planId: string, from: string, to: string): Promise<readonly MedicationIntakeRecord[]>;
}>;

export type MedicationOperationInput = Readonly<{ idempotencyKey: string; digest: string }>;
export type MedicationIntakeCommand = Readonly<{
  planId: string;
  occurrenceId?: string;
  scheduledFor?: string;
  state: MedicationIntakeState;
  takenAt?: string;
  quantity?: string;
  unit?: MedicationIntakeRecord["unit"];
}>;
