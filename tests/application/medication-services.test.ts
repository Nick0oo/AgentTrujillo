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

const usScope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read", "record", "manage_medication"],
  countryOfCare: "US",
  timezone: "America/New_York",
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

  it("accepts only retrospective intake facts with state-consistent timestamps", async () => {
    const store = createMemoryStore();
    const planService = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await planService.createDraft(scope, input(), { idempotencyKey: "plan-intake-time", digest: "caller" });
    await planService.confirm(scope, plan.id, { idempotencyKey: "confirm-intake-time", digest: "caller" });
    const schedule = await createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }).materialize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "schedule-intake-time", digest: "caller" });
    const intakeService = createMedicationIntakeService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const futureOccurrence = schedule.occurrences.find((value) => value.scheduledFor === "2026-08-16T20:00:00.000Z")!;

    await expect(intakeService.record(scope, { planId: plan.id, occurrenceId: futureOccurrence.occurrenceId, state: "unknown" }, { idempotencyKey: "future-occurrence", digest: "caller" })).rejects.toThrow("MEDICATION_FUTURE_INTAKE_DENIED");
    await expect(intakeService.record(scope, { planId: plan.id, scheduledFor: "2026-08-16T11:00:00Z", state: "skipped" }, { idempotencyKey: "future-direct", digest: "caller" })).rejects.toThrow("MEDICATION_FUTURE_INTAKE_DENIED");
    await expect(intakeService.record(scope, { planId: plan.id, scheduledFor: "invalid", state: "unknown" }, { idempotencyKey: "invalid-time", digest: "caller" })).rejects.toThrow("MEDICATION_INTAKE_TIME_INVALID");
    await expect(intakeService.record(scope, { planId: plan.id, scheduledFor: "2026-08-16T08:00:00Z", state: "taken", takenAt: "2026-08-16T11:00:00Z" }, { idempotencyKey: "future-taken", digest: "caller" })).rejects.toThrow("MEDICATION_FUTURE_INTAKE_DENIED");
    await expect(intakeService.record(scope, { planId: plan.id, scheduledFor: "2026-08-16T08:00:00Z", state: "skipped", takenAt: "2026-08-16T08:01:00Z" }, { idempotencyKey: "inconsistent-state", digest: "caller" })).rejects.toThrow("MEDICATION_TAKEN_AT_FORBIDDEN");
  });

  it("denies a stale scope before any persistence call", async () => {
    const store = createMemoryStore();
    const service = createMedicationPlanService(store, { now: () => new Date("2026-08-17T00:00:00Z") });
    await expect(service.createDraft(scope, input(), { idempotencyKey: "stale", digest: "stale" })).rejects.toThrow("MEDICATION_SCOPE_DENIED");
  });

  it("anchors interval cadence to the plan start and refuses silent truncation", async () => {
    const store = createMemoryStore();
    const plans = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await plans.createDraft(scope, { ...input(), frequency: { kind: "interval", everyHours: "8" } }, { idempotencyKey: "interval-plan", digest: "caller-value" });
    await plans.confirm(scope, plan.id, { idempotencyKey: "interval-confirm", digest: "caller-value" });
    const service = createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const result = await service.materialize(scope, plan.id, { from: "2026-08-16T10:00:00Z", to: "2026-08-17T00:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "interval-window", digest: "caller-value" });
    expect(result.occurrences.map((value) => value.scheduledFor)).toEqual(["2026-08-16T16:00:00.000Z"]);
    await expect(service.materialize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-18T00:00:00Z", maxOccurrences: 2 }, { idempotencyKey: "interval-overflow", digest: "caller-value" })).rejects.toThrow("MEDICATION_OCCURRENCE_BOUND_EXCEEDED");
  });

  it("advances time-of-day schedules by local calendar date across DST", async () => {
    const store = createMemoryStore();
    const plans = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await plans.createDraft(usScope, { ...input(), codingSystem: "RxNorm", startsAt: "2026-10-31T04:00:00Z", frequency: { kind: "times_of_day", times: ["08:00"] } }, { idempotencyKey: "dst-plan", digest: "caller" });
    await plans.confirm(usScope, plan.id, { idempotencyKey: "dst-confirm", digest: "caller" });
    const result = await createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }).materialize(usScope, plan.id, { from: "2026-10-31T04:00:00Z", to: "2026-11-03T05:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "dst-window", digest: "caller" });
    expect(result.occurrences.map((value) => value.scheduledFor)).toEqual([
      "2026-10-31T12:00:00.000Z",
      "2026-11-01T13:00:00.000Z",
      "2026-11-02T13:00:00.000Z",
    ]);
  });

  it("fails closed for nonexistent or ambiguous local medication times", async () => {
    const createPlan = async (startsAt: string, time: string, key: string) => {
      const store = createMemoryStore();
      const plans = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
      const plan = await plans.createDraft(usScope, { ...input(), codingSystem: "RxNorm", startsAt, frequency: { kind: "times_of_day", times: [time] } }, { idempotencyKey: `${key}-plan`, digest: "caller" });
      await plans.confirm(usScope, plan.id, { idempotencyKey: `${key}-confirm`, digest: "caller" });
      return { plan, service: createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }) };
    };
    const spring = await createPlan("2026-03-07T05:00:00Z", "02:30", "spring");
    await expect(spring.service.materialize(usScope, spring.plan.id, { from: "2026-03-07T05:00:00Z", to: "2026-03-09T04:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "spring-window", digest: "caller" })).rejects.toThrow("MEDICATION_LOCAL_TIME_INVALID");
    const fall = await createPlan("2026-10-31T04:00:00Z", "01:30", "fall");
    await expect(fall.service.materialize(usScope, fall.plan.id, { from: "2026-10-31T04:00:00Z", to: "2026-11-02T05:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "fall-window", digest: "caller" })).rejects.toThrow("MEDICATION_LOCAL_TIME_AMBIGUOUS");
  });

  it("binds replay identity to the actual plan input instead of a caller digest", async () => {
    const store = createMemoryStore();
    const service = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    await service.createDraft(scope, input(), { idempotencyKey: "domain-bound", digest: "same-caller-digest" });
    await expect(service.createDraft(scope, { ...input(), displayName: "changed medication" }, { idempotencyKey: "domain-bound", digest: "same-caller-digest" })).rejects.toThrow("MEDICATION_IDEMPOTENCY_CONFLICT");
  });

  it("resolves a confirmation replay before checking the transitioned plan state", async () => {
    const store = createMemoryStore();
    const service = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const draft = await service.createDraft(scope, input(), { idempotencyKey: "confirm-replay-plan", digest: "caller" });
    const first = await service.confirm(scope, draft.id, { idempotencyKey: "confirm-replay", digest: "caller-a" });
    const replay = await service.confirm(scope, draft.id, { idempotencyKey: "confirm-replay", digest: "caller-b" });
    expect(replay).toEqual(first);
  });

  it("marks adherence source incomplete when active facts conflict", async () => {
    const store = createMemoryStore();
    const plans = createMedicationPlanService(store, { now: () => new Date("2026-08-16T10:00:00Z") });
    const plan = await plans.createDraft(scope, input(), { idempotencyKey: "conflict-plan", digest: "caller" });
    await plans.confirm(scope, plan.id, { idempotencyKey: "conflict-confirm", digest: "caller" });
    const schedule = await createMedicationScheduleService(store, { now: () => new Date("2026-08-16T10:00:00Z") }).materialize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z", maxOccurrences: 10 }, { idempotencyKey: "conflict-schedule", digest: "caller" });
    const occurrence = schedule.occurrences[0]!;
    const operation = { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: "record_intake" as const, idempotencyKey: "direct", digest: "a".repeat(64) };
    await store.createIntake(scope, { planId: plan.id, occurrenceId: occurrence.occurrenceId, scheduledFor: occurrence.scheduledFor, takenAt: occurrence.scheduledFor, state: "taken", quantity: null, unit: null, supersedesId: null }, operation);
    await store.createIntake(scope, { planId: plan.id, occurrenceId: occurrence.occurrenceId, scheduledFor: occurrence.scheduledFor, takenAt: null, state: "skipped", quantity: null, unit: null, supersedesId: null }, { ...operation, idempotencyKey: "direct-2" });
    const summary = await createAdherenceSummaryQuery(store, { now: () => new Date("2026-08-16T10:00:00Z") }).summarize(scope, plan.id, { from: "2026-08-16T00:00:00Z", to: "2026-08-17T00:00:00Z" });
    expect(summary.sourceComplete).toBe(false);
  });
});
