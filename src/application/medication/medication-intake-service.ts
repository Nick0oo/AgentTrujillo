import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationIntakeRecord } from "../../clinical/medication/types.ts";
import { createMedicationOperationExecutor } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationIntakeCommand, MedicationOperationInput, MedicationStore } from "./ports.ts";
import { requireMedicationScope, requirePlanRecord } from "./scope.ts";

export function createMedicationIntakeService(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const execute = createMedicationOperationExecutor();
  function operation(scope: AuthorizedChildScope, kind: "record_intake" | "correct_intake", input: MedicationOperationInput) {
    return { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: kind, idempotencyKey: input.idempotencyKey, digest: input.digest } as const;
  }
  async function validateCommand(scope: AuthorizedChildScope, command: MedicationIntakeCommand): Promise<Readonly<{ planId: string; occurrenceId: string | null; scheduledFor: string | null }>> {
    requirePlanRecord(scope, command.planId);
    const plan = await store.getPlan(scope, command.planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND");
    if (command.state === "taken" && !command.takenAt) throw new Error("MEDICATION_TAKEN_AT_REQUIRED");
    const occurrence = command.occurrenceId ? await store.getOccurrence(scope, command.occurrenceId) : null;
    if (command.occurrenceId && (!occurrence || occurrence.planId !== plan.id)) throw new Error("MEDICATION_OCCURRENCE_NOT_FOUND");
    return { planId: plan.id, occurrenceId: occurrence?.occurrenceId ?? null, scheduledFor: occurrence?.scheduledFor ?? command.scheduledFor ?? null };
  }
  const service = {
    async record(scope: AuthorizedChildScope, command: MedicationIntakeCommand, inputOperation: MedicationOperationInput): Promise<MedicationIntakeRecord> {
      requireMedicationScope(scope, "record", now());
      const normalized = await validateCommand(scope, command);
      const op = operation(scope, "record_intake", inputOperation);
      return (await execute(op, () => store.createIntake(scope, { ...normalized, takenAt: command.takenAt ?? null, state: command.state, quantity: (command.quantity ?? null) as MedicationIntakeRecord["quantity"], unit: command.unit ?? null, supersedesId: null }, op))).value;
    },
    async correct(scope: AuthorizedChildScope, intakeId: string, command: MedicationIntakeCommand, inputOperation: MedicationOperationInput): Promise<MedicationIntakeRecord> {
      requireMedicationScope(scope, "record", now());
      const previous = await store.getIntake(scope, intakeId); if (!previous) throw new Error("MEDICATION_INTAKE_NOT_FOUND");
      const normalized = await validateCommand(scope, command);
      const op = operation(scope, "correct_intake", inputOperation);
      return (await execute(op, () => store.createIntake(scope, { ...normalized, takenAt: command.takenAt ?? null, state: command.state, quantity: (command.quantity ?? null) as MedicationIntakeRecord["quantity"], unit: command.unit ?? null, supersedesId: previous.id }, op))).value;
    },
    async get(scope: AuthorizedChildScope, intakeId: string): Promise<MedicationIntakeRecord> {
      requireMedicationScope(scope, "read", now());
      const value = await store.getIntake(scope, intakeId); if (!value) throw new Error("MEDICATION_INTAKE_NOT_FOUND"); return value;
    },
    async list(scope: AuthorizedChildScope, planId: string, window: Readonly<{ from: string; to: string }>): Promise<readonly MedicationIntakeRecord[]> {
      requireMedicationScope(scope, "read", now());
      return store.listIntakes(scope, planId, window.from, window.to);
    },
  };
  return service;
}

export type MedicationIntakeService = ReturnType<typeof createMedicationIntakeService>;
