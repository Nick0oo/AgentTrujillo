import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPermission, type AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MedicationPlanInput, MedicationPlanRecord, MedicationScheduleOccurrence, MedicationIntakeRecord, MedicationUnit } from "../../clinical/medication/types.ts";
import type { MedicationOperation } from "./medication-idempotency.ts";
import type { Database } from "./database.types.ts";
import type { MedicationStore } from "../../application/medication/ports.ts";

type Client = SupabaseClient<Database>;
type RpcRow = Readonly<Record<string, unknown>>;
type RpcResult = Readonly<{ data: unknown; error: Readonly<{ message: string }> | null }>;

function rpcClient(client: Client) {
  return client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult>; from(table: string): any };
}

function firstRow(data: unknown): RpcRow | null {
  if (Array.isArray(data)) return (data[0] as RpcRow | undefined) ?? null;
  return data && typeof data === "object" ? data as RpcRow : null;
}

function requireRpcRow(result: RpcResult, requestId: string): RpcRow {
  if (result.error) throw new Error(`MEDICATION_RPC_FAILED:${requestId}`);
  const row = firstRow(result.data);
  if (!row) throw new Error("MEDICATION_SCOPE_DENIED");
  return row;
}

function mapPlan(row: RpcRow, scope: AuthorizedChildScope): MedicationPlanRecord {
  const schedule = Array.isArray(row.medication_schedules) ? firstRow(row.medication_schedules) : null;
  const rawFrequency = schedule?.frequency_kind === "interval"
    ? { kind: "interval" as const, everyHours: String(schedule.interval_hours) }
    : schedule?.frequency_kind === "times_of_day"
      ? { kind: "times_of_day" as const, times: (Array.isArray(schedule.times_of_day) ? schedule.times_of_day : []).map(String) }
      : schedule?.frequency_kind === "as_needed"
        ? { kind: "as_needed" as const, label: String(schedule.instructions ?? "declared as needed") }
        : undefined;
  return {
    id: String(row.id),
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    version: Number(row.version ?? 1),
    status: String(row.status) as MedicationPlanRecord["status"],
    input: {
      displayName: String(row.display_name),
      conceptCode: String((firstRow(row.medication_concepts)?.concept_code ?? row.medication_concept_id) as string),
      codingSystem: String(firstRow(row.medication_concepts)?.coding_system ?? "INVIMA") as MedicationPlanInput["codingSystem"],
      presentationId: row.medication_presentation_id ? String(row.medication_presentation_id) : undefined,
      declaredIndication: row.declared_indication ? String(row.declared_indication) : undefined,
      startsAt: new Date(String(row.starts_at)).toISOString(),
      endsAt: row.ends_at ? new Date(String(row.ends_at)).toISOString() : undefined,
      route: schedule?.route as MedicationPlanInput["route"],
      frequency: rawFrequency,
      dose: schedule?.dose_quantity ? { quantity: String(schedule.dose_quantity), unit: String(schedule.dose_unit) as MedicationUnit } : undefined,
      instructions: schedule?.instructions ? String(schedule.instructions) : undefined,
    },
    recordedBy: String(row.recorded_by),
    supersedesId: row.supersedes_plan_id ? String(row.supersedes_plan_id) : null,
  };
}

function mapOccurrence(row: RpcRow): MedicationScheduleOccurrence {
  return { occurrenceId: String(row.occurrence_key), planId: String(row.medication_plan_id), planVersion: Number(row.plan_version), scheduledFor: new Date(String(row.scheduled_for)).toISOString(), localDate: String(row.local_date), timeZone: String(row.time_zone), source: String(row.source) as MedicationScheduleOccurrence["source"] };
}

function mapIntake(row: RpcRow): MedicationIntakeRecord {
  return { id: String(row.id), planId: String(row.medication_plan_id), occurrenceId: row.medication_schedule_occurrence_id ? String(row.medication_schedule_occurrence_id) : null, scheduledFor: row.scheduled_for ? new Date(String(row.scheduled_for)).toISOString() : null, takenAt: row.taken_at ? new Date(String(row.taken_at)).toISOString() : null, state: String(row.status) as MedicationIntakeRecord["state"], quantity: row.actual_quantity === null || row.actual_quantity === undefined ? null : String(row.actual_quantity) as MedicationIntakeRecord["quantity"], unit: row.actual_unit ? String(row.actual_unit) as MedicationIntakeRecord["unit"] : null, recordedBy: String(row.recorded_by), supersedesId: row.supersedes_intake_id ? String(row.supersedes_intake_id) : null };
}

export function createMedicationRepository(client: Client, options: Readonly<{ resolveConceptId: (scope: AuthorizedChildScope, input: MedicationPlanInput) => Promise<string> }> ): MedicationStore {
  const dynamic = rpcClient(client);
  function assert(scope: AuthorizedChildScope, permission: "read" | "record" | "manage_medication") { if (!hasPermission(scope, permission)) throw new Error("MEDICATION_SCOPE_DENIED"); }
  async function planById(scope: AuthorizedChildScope, planId: string): Promise<MedicationPlanRecord | null> {
    assert(scope, "read");
    const result = await dynamic.from("medication_plans").select("*, medication_concepts(*), medication_schedules(*)").eq("id", planId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).maybeSingle();
    if (result.error) throw new Error("MEDICATION_READ_FAILED");
    return result.data ? mapPlan(result.data as RpcRow, scope) : null;
  }
  return {
    async createPlan(scope, input, operation) {
      assert(scope, "manage_medication");
      const conceptId = await options.resolveConceptId(scope, input);
      const row = requireRpcRow(await dynamic.rpc("record_medication_plan", { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_medication_concept_id: conceptId, p_medication_presentation_id: input.presentationId ?? null, p_display_name: input.displayName, p_declared_indication: input.declaredIndication ?? null, p_starts_at: input.startsAt, p_ends_at: input.endsAt ?? null, p_input_fingerprint: operation.digest, p_idempotency_key: operation.idempotencyKey, p_input_payload: input }), "record_medication_plan");
      const plan = await planById(scope, String(row.plan_id)); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND"); return plan;
    },
    async getPlan(scope, planId) { return planById(scope, planId); },
    async listPlans(scope) { assert(scope, "read"); const result = await dynamic.from("medication_plans").select("*, medication_concepts(*), medication_schedules(*)").eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).order("starts_at", { ascending: false }); if (result.error) throw new Error("MEDICATION_READ_FAILED"); return (result.data as RpcRow[]).map((row) => mapPlan(row, scope)); },
    async setPlanStatus(scope, planId, status, operation) { assert(scope, "manage_medication"); const row = requireRpcRow(await dynamic.rpc("transition_medication_plan", { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_plan_id: planId, p_status: status, p_idempotency_key: operation.idempotencyKey, p_input_digest: operation.digest, p_input_payload: {} }), "transition_medication_plan"); const plan = await planById(scope, String(row.plan_id)); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND"); return plan; },
    async supersedePlan(scope, planId, input, operation) { assert(scope, "manage_medication"); const current = await planById(scope, planId); if (!current) throw new Error("MEDICATION_PLAN_NOT_FOUND"); const conceptId = await options.resolveConceptId(scope, input); const row = requireRpcRow(await dynamic.rpc("supersede_medication_plan", { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_plan_id: planId, p_medication_concept_id: conceptId, p_medication_presentation_id: input.presentationId ?? null, p_display_name: input.displayName, p_declared_indication: input.declaredIndication ?? null, p_starts_at: input.startsAt, p_ends_at: input.endsAt ?? null, p_input_fingerprint: operation.digest, p_idempotency_key: operation.idempotencyKey, p_input_payload: input }), "supersede_medication_plan"); const plan = await planById(scope, String(row.plan_id)); if (!plan) throw new Error("MEDICATION_PLAN_NOT_FOUND"); return plan; },
    async listOccurrences(scope, planId, from, to) { assert(scope, "read"); const result = await dynamic.from("medication_schedule_occurrences").select("*").eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).eq("medication_plan_id", planId).gte("scheduled_for", from).lt("scheduled_for", to).order("scheduled_for", { ascending: true }); if (result.error) throw new Error("MEDICATION_READ_FAILED"); return (result.data as RpcRow[]).map(mapOccurrence); },
    async putOccurrences(scope, occurrences, operation) { assert(scope, "manage_medication"); const first = occurrences[0]; if (!first) return occurrences; const row = requireRpcRow(await dynamic.rpc("record_medication_schedule_occurrences", { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_medication_plan_id: first.planId, p_plan_version: first.planVersion, p_occurrences: occurrences.map((value) => ({ occurrence_key: value.occurrenceId, scheduled_for: value.scheduledFor, local_date: value.localDate, time_zone: value.timeZone, source: value.source })), p_input_digest: operation.digest, p_idempotency_key: operation.idempotencyKey }), "record_medication_schedule_occurrences"); if (row.saved_count === undefined) throw new Error("MEDICATION_SCHEDULE_WRITE_FAILED"); return occurrences; },
    async getOccurrence(scope, occurrenceId) { assert(scope, "read"); const result = await dynamic.from("medication_schedule_occurrences").select("*").eq("id", occurrenceId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).maybeSingle(); if (result.error) throw new Error("MEDICATION_READ_FAILED"); return result.data ? mapOccurrence(result.data as RpcRow) : null; },
    async createIntake(scope, value, operation) { assert(scope, "record"); const rpcName = value.supersedesId ? "correct_medication_intake" : "record_medication_intake"; const params = value.supersedesId ? { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_original_intake_id: value.supersedesId, p_medication_plan_id: value.planId, p_medication_schedule_occurrence_id: value.occurrenceId, p_scheduled_for: value.scheduledFor, p_taken_at: value.takenAt, p_status: value.state, p_actual_quantity_lexeme: value.quantity, p_actual_unit: value.unit, p_input_fingerprint: operation.digest, p_idempotency_key: operation.idempotencyKey, p_input_payload: value } : { p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_medication_plan_id: value.planId, p_medication_schedule_occurrence_id: value.occurrenceId, p_scheduled_for: value.scheduledFor, p_taken_at: value.takenAt, p_status: value.state, p_actual_quantity_lexeme: value.quantity, p_actual_unit: value.unit, p_input_fingerprint: operation.digest, p_idempotency_key: operation.idempotencyKey, p_input_payload: value }; const row = requireRpcRow(await dynamic.rpc(rpcName, params), rpcName); const result = await dynamic.from("medication_intakes").select("*").eq("id", String(row.intake_id)).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).maybeSingle(); if (result.error || !result.data) throw new Error("MEDICATION_INTAKE_NOT_FOUND"); return mapIntake(result.data as RpcRow); },
    async getIntake(scope, intakeId) { assert(scope, "read"); const result = await dynamic.from("medication_intakes").select("*").eq("id", intakeId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).maybeSingle(); if (result.error) throw new Error("MEDICATION_READ_FAILED"); return result.data ? mapIntake(result.data as RpcRow) : null; },
    async listIntakes(scope, planId, from, to) { assert(scope, "read"); const result = await dynamic.from("medication_intakes").select("*").eq("medication_plan_id", planId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).or(`scheduled_for.is.null,and(scheduled_for.gte.${from},scheduled_for.lt.${to})`).order("scheduled_for", { ascending: true }); if (result.error) throw new Error("MEDICATION_READ_FAILED"); return (result.data as RpcRow[]).map(mapIntake); },
  };
}
