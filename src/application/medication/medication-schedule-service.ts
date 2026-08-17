import { createHash } from "node:crypto";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationPlanRecord, MedicationScheduleOccurrence } from "../../clinical/medication/types.ts";
import { createMedicationOperationExecutor } from "../../persistence/supabase/medication-idempotency.ts";
import type { MedicationOperationInput, MedicationStore } from "./ports.ts";
import { requireMedicationScope, requirePlanRecord } from "./scope.ts";

function localParts(instant: Date, timeZone: string): Readonly<{ year: number; month: number; day: number; date: string }> {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), date: `${values.year}-${values.month}-${values.day}` };
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(instant);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return (Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - instant.getTime()) / 60000;
}

function localToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallTime = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0);
  let candidate = new Date(wallTime);
  for (let attempt = 0; attempt < 3; attempt += 1) candidate = new Date(wallTime - offsetMinutes(candidate, timeZone) * 60000);
  return candidate;
}

function occurrenceId(plan: MedicationPlanRecord, scheduledFor: string): string {
  return createHash("sha256").update(`${plan.id}|${plan.version}|${scheduledFor}`).digest("hex");
}

export function createMedicationScheduleService(store: MedicationStore, options: Readonly<{ now?: () => Date }> = {}) {
  const now = options.now ?? (() => new Date());
  const execute = createMedicationOperationExecutor();
  return {
    async materialize(scope: AuthorizedChildScope, planOrCommand: string | Readonly<{ planId: string; window: Readonly<{ from: string; to: string }>; idempotencyKey: string; digest?: string }>, rangeOrOperation: Readonly<{ from: string; to: string; maxOccurrences: number }> | MedicationOperationInput, operationArgument?: MedicationOperationInput) {
      const planId = typeof planOrCommand === "string" ? planOrCommand : planOrCommand.planId;
      const range = typeof planOrCommand === "string" ? rangeOrOperation as Readonly<{ from: string; to: string; maxOccurrences: number }> : { ...planOrCommand.window, maxOccurrences: 1000 };
      const inputOperation = typeof planOrCommand === "string" ? operationArgument! : { idempotencyKey: planOrCommand.idempotencyKey, digest: planOrCommand.digest ?? planOrCommand.idempotencyKey };
      requireMedicationScope(scope, "read", now()); requirePlanRecord(scope, planId);
      if (range.maxOccurrences < 1 || range.maxOccurrences > 1000) throw new Error("MEDICATION_OCCURRENCE_BOUND_INVALID");
      const plan = await store.getPlan(scope, planId); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND");
      if (plan.status !== "active") return { occurrences: [] as readonly MedicationScheduleOccurrence[], explanationCodes: ["PLAN_NOT_ACTIVE"] as const };
      const frequency = plan.input.frequency;
      if (!frequency || frequency.kind === "as_needed") return { occurrences: [] as readonly MedicationScheduleOccurrence[], explanationCodes: ["PRN_NOT_MATERIALIZED"] as const };
      const from = Date.parse(range.from); const to = Date.parse(range.to); if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error("MEDICATION_RANGE_INVALID");
      const end = plan.input.endsAt ? Math.min(to, Date.parse(plan.input.endsAt)) : to;
      const start = Math.max(from, Date.parse(plan.input.startsAt));
      const occurrences: MedicationScheduleOccurrence[] = [];
      if (frequency.kind === "interval") {
        const hours = Number(frequency.everyHours); if (!Number.isFinite(hours) || hours <= 0) throw new Error("MEDICATION_INTERVAL_INVALID");
        for (let instant = start; instant < end && occurrences.length < range.maxOccurrences; instant += hours * 60 * 60 * 1000) {
          const date = new Date(instant);
          occurrences.push({ occurrenceId: occurrenceId(plan, date.toISOString()), planId: plan.id, planVersion: plan.version, scheduledFor: date.toISOString(), localDate: localParts(date, scope.timezone).date, timeZone: scope.timezone, source: "interval" });
        }
      } else {
        for (let cursor = new Date(start); cursor.getTime() < end && occurrences.length < range.maxOccurrences; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
          const date = localParts(cursor, scope.timezone);
          for (const time of [...frequency.times].sort()) {
            const scheduled = localToUtc(date.date, time, scope.timezone);
            if (scheduled.getTime() >= start && scheduled.getTime() < end && occurrences.length < range.maxOccurrences) occurrences.push({ occurrenceId: occurrenceId(plan, scheduled.toISOString()), planId: plan.id, planVersion: plan.version, scheduledFor: scheduled.toISOString(), localDate: date.date, timeZone: scope.timezone, source: "times_of_day" });
          }
        }
      }
      const operation = { careSpaceId: scope.careSpaceId, childId: scope.childId, actorUserId: scope.actorUserId, operationKind: "materialize_schedule" as const, idempotencyKey: inputOperation.idempotencyKey, digest: inputOperation.digest };
      const saved = (await execute(operation, () => store.putOccurrences(scope, occurrences, operation))).value;
      return { occurrences: saved, explanationCodes: ["BOUNDED_PLAN_VERSIONED_OCCURRENCES"] as const };
    },
    async listOccurrences(scope: AuthorizedChildScope, planId: string, range: Readonly<{ from: string; to: string }>) {
      requireMedicationScope(scope, "read", now());
      return store.listOccurrences(scope, planId, range.from, range.to);
    },
    async reconcileFuture() {
      return { changed: false, explanationCodes: ["RECONCILIATION_REQUIRES_NEW_PLAN_VERSION"] as const };
    },
  };
}
