import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationIntakeRecord } from "../../clinical/medication/types.ts";
import { createMedicationOperationExecutor, deriveMedicationOperationDigest } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationCommandReceipt, MedicationIntakeCommand, MedicationOperationInput, MedicationStore } from "./ports.ts";
import { requireMedicationScope, requirePlanRecord } from "./scope.ts";

export function createMedicationIntakeService(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const execute = createMedicationOperationExecutor();
  function operation(scope: AuthorizedChildScope, kind: "record_intake" | "correct_intake", input: MedicationOperationInput, domainInput: unknown) {
    return { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: kind, idempotencyKey: input.idempotencyKey, digest: deriveMedicationOperationDigest({ kind, domainInput }) } as const;
  }
  async function validateCommand(scope: AuthorizedChildScope, command: MedicationIntakeCommand): Promise<Readonly<{ planId: string; occurrenceId: string | null; scheduledFor: string | null }>> {
    requirePlanRecord(scope, command.planId);
    const plan = await store.getPlan(scope, command.planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND");
    if (plan.status !== "active") throw new Error("MEDICATION_PLAN_NOT_ACTIVE");
    if (command.state === "taken" && !command.takenAt) throw new Error("MEDICATION_TAKEN_AT_REQUIRED");
    if (command.state !== "taken" && command.takenAt) throw new Error("MEDICATION_TAKEN_AT_FORBIDDEN");
    const occurrence = command.occurrenceId ? await store.getOccurrence(scope, command.occurrenceId) : null;
    if (command.occurrenceId && (!occurrence || occurrence.planId !== plan.id)) throw new Error("MEDICATION_OCCURRENCE_NOT_FOUND");
    const scheduledFor = occurrence?.scheduledFor ?? command.scheduledFor ?? null;
    const currentTime = now().getTime();
    const scheduledTime = scheduledFor === null ? null : Date.parse(scheduledFor);
    const takenTime = command.takenAt === undefined ? null : Date.parse(command.takenAt);
    if ((scheduledTime !== null && !Number.isFinite(scheduledTime)) || (takenTime !== null && !Number.isFinite(takenTime))) throw new Error("MEDICATION_INTAKE_TIME_INVALID");
    if ((scheduledTime !== null && scheduledTime > currentTime) || (takenTime !== null && takenTime > currentTime)) throw new Error("MEDICATION_FUTURE_INTAKE_DENIED");
    return { planId: plan.id, occurrenceId: occurrence?.occurrenceId ?? null, scheduledFor };
  }
  async function recordWithOutcome(
    scope: AuthorizedChildScope,
    command: MedicationIntakeCommand,
    inputOperation: MedicationOperationInput,
  ): Promise<MedicationCommandReceipt<MedicationIntakeRecord>> {
    requireMedicationScope(scope, "record", now());
    const normalized = await validateCommand(scope, command);
    const op = operation(scope, "record_intake", inputOperation, { ...normalized, takenAt: command.takenAt ?? null, state: command.state, quantity: command.quantity ?? null, unit: command.unit ?? null });
    return execute(op, () => store.createIntake(scope, { ...normalized, takenAt: command.takenAt ?? null, state: command.state, quantity: (command.quantity ?? null) as MedicationIntakeRecord["quantity"], unit: command.unit ?? null, supersedesId: null }, op));
  }
  const service = {
    async record(scope: AuthorizedChildScope, command: MedicationIntakeCommand, inputOperation: MedicationOperationInput): Promise<MedicationIntakeRecord> {
      return (await recordWithOutcome(scope, command, inputOperation)).value;
    },
    recordWithOutcome,
    async correct(scope: AuthorizedChildScope, intakeId: string, command: MedicationIntakeCommand, inputOperation: MedicationOperationInput): Promise<MedicationIntakeRecord> {
      requireMedicationScope(scope, "record", now());
      const previous = await store.getIntake(scope, intakeId); if (!previous) throw new Error("MEDICATION_INTAKE_NOT_FOUND");
      const normalized = await validateCommand(scope, command);
      const op = operation(scope, "correct_intake", inputOperation, { intakeId, ...normalized, takenAt: command.takenAt ?? null, state: command.state, quantity: command.quantity ?? null, unit: command.unit ?? null });
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
