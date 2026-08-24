import { medicationPlanInputSchema, type MedicationPlanInput, type MedicationPlanRecord } from "../../clinical/medication/types.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createMedicationOperationExecutor, deriveMedicationOperationDigest } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationCommandReceipt, MedicationStore, MedicationOperationInput } from "./ports.ts";
import { requireMedicationScope, requirePlanRecord } from "./scope.ts";

export function createMedicationPlanService(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const execute = createMedicationOperationExecutor();
  function operation(scope: AuthorizedChildScope, kind: "create_plan" | "confirm_plan" | "end_plan" | "supersede_plan", input: MedicationOperationInput, domainInput: unknown) {
    return { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: kind, idempotencyKey: input.idempotencyKey, digest: deriveMedicationOperationDigest({ kind, domainInput }) } as const;
  }
  async function createDraftWithOutcome(scope: AuthorizedChildScope, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationCommandReceipt<MedicationPlanRecord>> {
    requireMedicationScope(scope, "manage_medication", now());
    const parsed = medicationPlanInputSchema.parse(input);
    if (!parsed.startsAt) throw new Error("MEDICATION_START_REQUIRED");
    const op = operation(scope, "create_plan", inputOperation, parsed);
    const executed = await execute(op, () => store.createPlanWithOutcome(scope, parsed as MedicationPlanInput, op));
    return {
      outcome: executed.outcome === "replayed" || executed.value.outcome === "idempotent_replay" ? "replayed" : "created",
      value: executed.value.value,
    };
  }
  async function confirmDeclaredPlanWithOutcome(scope: AuthorizedChildScope, planId: string, inputOperation: MedicationOperationInput): Promise<MedicationCommandReceipt<MedicationPlanRecord>> {
    requireMedicationScope(scope, "manage_medication", now());
    requirePlanRecord(scope, planId);
    const op = operation(scope, "confirm_plan", inputOperation, { planId, status: "active" });
    const executed = await execute(op, async () => {
      const plan = await store.getPlan(scope, planId);
      if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND");
      if (plan.status !== "draft") throw new Error("MEDICATION_PLAN_NOT_DRAFT");
      return store.setPlanStatusWithOutcome(scope, planId, "active", op);
    });
    return {
      outcome: executed.outcome === "replayed" || executed.value.outcome === "idempotent_replay" ? "replayed" : "created",
      value: executed.value.value,
    };
  }
  const service = {
    async createDraft(scope: AuthorizedChildScope, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return (await createDraftWithOutcome(scope, input, inputOperation)).value;
    },
    async confirm(scope: AuthorizedChildScope, planId: string, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return (await confirmDeclaredPlanWithOutcome(scope, planId, inputOperation)).value;
    },
    async read(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "read", now()); requirePlanRecord(scope, planId);
      const plan = await store.getPlan(scope, planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND"); return plan;
    },
    async list(scope: AuthorizedChildScope): Promise<readonly MedicationPlanRecord[]> { requireMedicationScope(scope, "read", now()); return store.listPlans(scope); },
    async end(scope: AuthorizedChildScope, planId: string, status: "completed" | "cancelled", inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now()); requirePlanRecord(scope, planId);
      const op = operation(scope, "end_plan", inputOperation, { planId, status });
      return (await execute(op, () => store.setPlanStatus(scope, planId, status, op))).value;
    },
    async supersede(scope: AuthorizedChildScope, planId: string, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now()); requirePlanRecord(scope, planId);
      const parsed = medicationPlanInputSchema.parse(input); if (!parsed.startsAt) throw new Error("MEDICATION_START_REQUIRED");
      const op = operation(scope, "supersede_plan", inputOperation, { planId, input: parsed });
      return (await execute(op, () => store.supersedePlan(scope, planId, parsed as MedicationPlanInput, op))).value;
    },
    async confirmDeclaredPlan(scope: AuthorizedChildScope, planId: string, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return (await confirmDeclaredPlanWithOutcome(scope, planId, inputOperation)).value;
    },
    createDraftWithOutcome,
    confirmDeclaredPlanWithOutcome,
    async getPlan(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord> {
      return service.read(scope, planId);
    },
    async listPlans(scope: AuthorizedChildScope): Promise<readonly MedicationPlanRecord[]> {
      return service.list(scope);
    },
    async endPlan(scope: AuthorizedChildScope, planId: string, status: "completed" | "cancelled", inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return service.end(scope, planId, status, inputOperation);
    },
    async supersedePlan(scope: AuthorizedChildScope, planId: string, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return service.supersede(scope, planId, input, inputOperation);
    },
  };
  return service;
}

export type MedicationPlanService = ReturnType<typeof createMedicationPlanService>;
