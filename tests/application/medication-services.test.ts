import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow, type AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope.ts";
import { createMedicationIntakeService } from "../../src/application/medication/medication-intake-service.ts";
import { createMedicationPlanService } from "../../src/application/medication/medication-plan-service.ts";
import { createMedicationScheduleService } from "../../src/application/medication/medication-schedule-service.ts";
import { createAdherenceSummaryQuery } from "../../src/application/medication/adherence-summary-query.ts";
import type { MedicationIntakeRecord, MedicationPlanRecord, MedicationScheduleOccurrence } from "../../src/clinical/medication/types.ts";
import type { MedicationStore } from "../../src/application/medication/ports.ts";

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read", "record", "manage_medication"],
  countryOfCare: "CO",
  timezone: "UTC",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-16T09:56:00Z"),
  expiresAt: new Date("2026-08-16T10:01:00Z"),
});

function input() {
  return {
    displayName: "synthetic medication",
    conceptCode: "SYN-001",
    codingSystem: "INVIMA" as const,
    startsAt: "2026-08-16T08:00:00Z",
    route: "oral" as const,
    dose: { quantity: "1", unit: "mL" as const },
    frequency: { kind: "times_of_day" as const, times: ["08:00", "20:00"] },
  };
}

function createMemoryStore(): MedicationStore {
  const plans = new Map<string, MedicationPlanRecord>();
  const occurrences = new Map<string, MedicationScheduleOccurrence>();
  const intakes = new Map<string, MedicationIntakeRecord>();
  let sequence = 0;
  return {
    async createPlan(currentScope, planInput, operation) {
      const id = `00000000-0000-0000-0000-${String(++sequence).padStart(12, "0")}`;
      const record: MedicationPlanRecord = { id, careSpaceId: currentScope.careSpaceId, childId: currentScope.childId, version: 1, status: "draft", input: planInput, recordedBy: currentScope.actorUserId, supersedesId: null };
      plans.set(id, record);
      return record;
    },
    async getPlan(currentScope, id) { const record = plans.get(id); return record?.careSpaceId === currentScope.careSpaceId && record.childId === currentScope.childId ? record : null; },
    async listPlans(currentScope) { return [...plans.values()].filter((record) => record.careSpaceId === currentScope.careSpaceId && record.childId === currentScope.childId); },
    async setPlanStatus(currentScope, id, status) { const record = await this.getPlan(currentScope, id); if (!record) throw new Error("NOT_FOUND"); const next = { ...record, status } as MedicationPlanRecord; plans.set(id, next); return next; },
    async supersedePlan(currentScope, id, nextInput, operation) { const previous = await this.getPlan(currentScope, id); if (!previous) throw new Error("NOT_FOUND"); plans.set(id, { ...previous, status: "superseded" }); return this.createPlan(currentScope, nextInput, operation); },
    async listOccurrences(currentScope, planId, from, to) { const plan = await this.getPlan(currentScope, planId); return plan ? [...occurrences.values()].filter((value) => value.planId === planId && value.scheduledFor >= from && value.scheduledFor < to) : []; },
    async putOccurrences(_currentScope, values) { for (const value of values) occurrences.set(value.occurrenceId, value); return values; },
    async getOccurrence(currentScope, occurrenceId) { const value = occurrences.get(occurrenceId); return value && (await this.getPlan(currentScope, value.planId)) ? value : null; },
    async createIntake(currentScope, value) { const id = `intake-${++sequence}`; const record = { ...value, id, recordedBy: currentScope.actorUserId } as MedicationIntakeRecord; intakes.set(id, record); return record; },
    async getIntake(currentScope, id) { const value = intakes.get(id); return value && (await this.getPlan(currentScope, value.planId)) ? value : null; },
    async listIntakes(currentScope, planId, from, to) { const plan = await this.getPlan(currentScope, planId); return plan ? [...intakes.values()].filter((value) => value.planId === planId && (value.scheduledFor === null || (value.scheduledFor >= from && value.scheduledFor < to))) : []; },
  };
}

describe("medication lifecycle services", () => {
  it("creates and confirms only a caregiver-declared plan", async () => {
    const store = createMemoryStore();
    const service = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const draft = await service.createDraft(scope, input(), { idempotencyKey: "plan-1", digest: "digest-1" });
    expect(draft.status).toBe("draft");
    const confirmed = await service.confirm(scope, draft.id, { idempotencyKey: "confirm-1", digest: "digest-2" });
    expect(confirmed.status).toBe("active");
    expect(JSON.stringify(confirmed)).not.toMatch(/recommended|safe|prescribed|alternative/i);
  });

  it("materializes bounded occurrences and does not expand as-needed schedules", async () => {
    const store = createMemoryStore();
    const plans = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await plans.createDraft(scope, { ...input(), frequency: { kind: "as_needed" as const, label: "declared as needed" } }, { idempotencyKey: "plan-prn", digest: "digest-prn" });
    await plans.confirm(scope, plan.id, { idempotencyKey: "confirm-prn", digest: "digest-prn-confirm" });
    const schedule = await createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }).materialize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "schedule-prn", digest: "digest-schedule" });
    expect(schedule.occurrences).toHaveLength(0);
    expect(schedule.explanationCodes).toContain("PRN_NOT_MATERIALIZED");
  });

  it("records factual intake and a neutral adherence summary", async () => {
    const store = createMemoryStore();
    const planService = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await planService.createDraft(scope, input(), { idempotencyKey: "plan-summary", digest: "digest-plan-summary" });
    await planService.confirm(scope, plan.id, { idempotencyKey: "confirm-summary", digest: "digest-confirm-summary" });
    const schedule = await createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }).materialize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "schedule-summary", digest: "digest-schedule-summary" });
    const intakeService = createMedicationIntakeService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    await intakeService.record(scope, { planId: plan.id, occurrenceId: schedule.occurrences[0]!.occurrenceId, state: "taken", takenAt: "2026-08-16T08:00:00Z" }, { idempotencyKey: "intake-summary", digest: "digest-intake-summary" });
    const summary = await createAdherenceSummaryQuery(store, { now: () => new Date("2026-08-16T10:00:00Z") }).summarize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z" });
    expect(summary.counts.taken).toBe(1);
    expect(summary.counts.noReport).toBe(1);
    expect(JSON.stringify(summary)).not.toMatch(/blame|poor|noncompliant|safe/i);
  });

  it("denies a stale scope before any persistence call", async () => {
    const store = createMemoryStore();
    const service = createMedicationPlanService(store, { now: () => new Date("2026-08-17T00:00:00Z") });
    await expect(service.createDraft(scope, input(), { idempotencyKey: "stale", digest: "stale" })).rejects.toThrow("MEDICATION_SCOPE_DENIED");
  });
});
