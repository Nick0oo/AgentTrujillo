import { medicationPlanInputSchema, type MedicationPlanInput, type MedicationPlanRecord } from "../../clinical/medication/types.ts";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import { createMedicationOperationExecutor } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationStore, MedicationOperationInput } from "./ports.ts";
import { requireMedicationScope, requirePlanRecord } from "./scope.ts";

export function createMedicationPlanService(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const execute = createMedicationOperationExecutor();
  function operation(scope: AuthorizedChildScope, kind: "create_plan" | "confirm_plan" | "end_plan" | "supersede_plan", input: MedicationOperationInput) {
    return { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: kind, idempotencyKey: input.idempotencyKey, digest: input.digest } as const;
  }
  const service = {
    async createDraft(scope: AuthorizedChildScope, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now());
      const parsed = medicationPlanInputSchema.parse(input);
      if (!parsed.startsAt) throw new Error("MEDICATION_START_REQUIRED");
      return (await execute(operation(scope, "create_plan", inputOperation), () => store.createPlan(scope, parsed as MedicationPlanInput, operation(scope, "create_plan", inputOperation)))).value;
    },
    async confirm(scope: AuthorizedChildScope, planId: string, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now()); requirePlanRecord(scope, planId);
      const plan = await store.getPlan(scope, planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND");
      if (plan.status !== "draft") throw new Error("MEDICATION_PLAN_NOT_DRAFT");
      return (await execute(operation(scope, "confirm_plan", inputOperation), () => store.setPlanStatus(scope, planId, "active", operation(scope, "confirm_plan", inputOperation)))).value;
    },
    async read(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "read", now()); requirePlanRecord(scope, planId);
      const plan = await store.getPlan(scope, planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND"); return plan;
    },
    async list(scope: AuthorizedChildScope): Promise<readonly MedicationPlanRecord[]> { requireMedicationScope(scope, "read", now()); return store.listPlans(scope); },
    async end(scope: AuthorizedChildScope, planId: string, status: "completed" | "cancelled", inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now()); requirePlanRecord(scope, planId);
      return (await execute(operation(scope, "end_plan", inputOperation), () => store.setPlanStatus(scope, planId, status, operation(scope, "end_plan", inputOperation)))).value;
    },
    async supersede(scope: AuthorizedChildScope, planId: string, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      requireMedicationScope(scope, "manage_medication", now()); requirePlanRecord(scope, planId);
      const parsed = medicationPlanInputSchema.parse(input); if (!parsed.startsAt) throw new Error("MEDICATION_START_REQUIRED");
      return (await execute(operation(scope, "supersede_plan", inputOperation), () => store.supersedePlan(scope, planId, parsed as MedicationPlanInput, operation(scope, "supersede_plan", inputOperation)))).value;
    },
    async confirmDeclaredPlan(scope: AuthorizedChildScope, planId: string, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return this.confirm(scope, planId, inputOperation);
    },
    async getPlan(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord> {
      return this.read(scope, planId);
    },
    async listPlans(scope: AuthorizedChildScope): Promise<readonly MedicationPlanRecord[]> {
      return this.list(scope);
    },
    async endPlan(scope: AuthorizedChildScope, planId: string, status: "completed" | "cancelled", inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return this.end(scope, planId, status, inputOperation);
    },
    async supersedePlan(scope: AuthorizedChildScope, planId: string, input: MedicationPlanInput, inputOperation: MedicationOperationInput): Promise<MedicationPlanRecord> {
      return this.supersede(scope, planId, input, inputOperation);
    },
  };
  return service;
}

export type MedicationPlanService = ReturnType<typeof createMedicationPlanService>;
