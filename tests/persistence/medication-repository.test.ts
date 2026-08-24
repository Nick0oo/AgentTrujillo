import { describe, expect, it } from "vitest";

import { executeMedicationOperation } from "../../src/persistence/supabase/medication-idempotency.ts";
import { createMedicationRepository } from "../../src/persistence/supabase/medication-repository.ts";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope.ts";

describe("medication operation idempotency", () => {
  it("replays the same scoped digest without running the effect twice", async () => {
    const store = new Map<string, { digest: string; value: string }>();
    let effects = 0;
    const first = await executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-1", actorUserId: "actor-1", operationKind: "create_plan", idempotencyKey: "key-1", digest: "digest-1" }, async () => {
      effects += 1;
      return "plan-1";
    });
    const replay = await executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-1", actorUserId: "actor-1", operationKind: "create_plan", idempotencyKey: "key-1", digest: "digest-1" }, async () => {
      effects += 1;
      return "plan-2";
    });
    expect(first).toEqual({ outcome: "created", value: "plan-1" });
    expect(replay).toEqual({ outcome: "replayed", value: "plan-1" });
    expect(effects).toBe(1);
  });

  it("rejects a different digest in the same scope", async () => {
    const store = new Map<string, { digest: string; value: string }>();
    await executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-1", actorUserId: "actor-1", operationKind: "record_intake", idempotencyKey: "key-1", digest: "digest-1" }, async () => "intake-1");
    await expect(executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-1", actorUserId: "actor-1", operationKind: "record_intake", idempotencyKey: "key-1", digest: "digest-2" }, async () => "intake-2")).rejects.toThrow("MEDICATION_IDEMPOTENCY_CONFLICT");
  });

  it("keeps identical keys independent across child and actor scope", async () => {
    const store = new Map<string, { digest: string; value: string }>();
    const first = await executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-1", actorUserId: "actor-1", operationKind: "create_plan", idempotencyKey: "key-1", digest: "digest-1" }, async () => "plan-1");
    const second = await executeMedicationOperation(store, { careSpaceId: "space-1", childId: "child-2", actorUserId: "actor-1", operationKind: "create_plan", idempotencyKey: "key-1", digest: "digest-1" }, async () => "plan-2");
    expect(first.value).toBe("plan-1");
    expect(second.value).toBe("plan-2");
  });

  it("looks up schedule occurrences by their public occurrence key", async () => {
    const filters: Array<[string, unknown]> = [];
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const client: any = { from: () => query, rpc: async () => ({ data: null, error: null }) };
    const repository = createMedicationRepository(client, { resolveConceptId: async () => "concept" });
    const authorized = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003", permissions: ["read"], countryOfCare: "CO", timezone: "UTC", authorizationVersion: "m:1:a:1", issuedAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 60_000) });
    await repository.getOccurrence(authorized, "occurrence-sha256-key");
    expect(filters[0]).toEqual(["occurrence_key", "occurrence-sha256-key"]);
  });

  it("resolves a public occurrence key to the scoped storage UUID before an intake RPC", async () => {
    const rpcCalls: Array<[string, Record<string, unknown>]> = [];
    let table = "";
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => table === "medication_schedule_occurrences"
        ? ({ data: { id: "00000000-0000-4000-8000-000000000010" }, error: null })
        : ({ data: { id: "00000000-0000-4000-8000-000000000020", medication_plan_id: "00000000-0000-4000-8000-000000000030", medication_schedule_occurrence_id: "00000000-0000-4000-8000-000000000010", scheduled_for: "2026-08-21T08:00:00Z", taken_at: "2026-08-21T08:01:00Z", status: "taken", actual_quantity: null, actual_unit: null, recorded_by: "00000000-0000-4000-8000-000000000001", supersedes_intake_id: null }, error: null }),
    };
    const client: any = {
      from: (name: string) => { table = name; return query; },
      rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push([name, args]); return { data: [{ intake_id: "00000000-0000-4000-8000-000000000020", outcome: "created" }], error: null }; },
    };
    const repository = createMedicationRepository(client, { resolveConceptId: async () => "concept" });
    const now = Date.now();
    const authorized = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003", permissions: ["read", "record"], countryOfCare: "CO", timezone: "UTC", authorizationVersion: "m:1:a:1", issuedAt: new Date(now - 60_000), expiresAt: new Date(now + 60_000) });
    await repository.createIntake(authorized, { planId: "00000000-0000-4000-8000-000000000030", occurrenceId: "occurrence-sha256-key", scheduledFor: "2026-08-21T08:00:00Z", takenAt: "2026-08-21T08:01:00Z", state: "taken", quantity: null, unit: null, supersedesId: null }, { careSpaceId: authorized.careSpaceId, childId: authorized.childId, actorUserId: authorized.actorUserId, operationKind: "record_intake", idempotencyKey: "intake", digest: "a".repeat(64) });
    expect(rpcCalls[0]?.[1].p_medication_schedule_occurrence_id).toBe("00000000-0000-4000-8000-000000000010");
  });

  it("uses the transition argument names generated from linked Cloud", async () => {
    const rpcCalls: Array<[string, Record<string, unknown>]> = [];
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: {
        id: "00000000-0000-4000-8000-000000000030",
        medication_plan_id: "00000000-0000-4000-8000-000000000030",
        display_name: "Synthetic medication",
        medication_concept_id: "00000000-0000-4000-8000-000000000040",
        starts_at: "2026-08-21T08:00:00Z",
        status: "active",
        version: 1,
        recorded_by: "00000000-0000-4000-8000-000000000001",
        medication_concepts: { concept_code: "SYN-001", coding_system: "INVIMA" },
        medication_schedules: [],
      }, error: null }),
    };
    const client: any = {
      from: () => query,
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push([name, args]);
        return { data: [{ plan_id: "00000000-0000-4000-8000-000000000030", outcome: "created" }], error: null };
      },
    };
    const repository = createMedicationRepository(client, { resolveConceptId: async () => "concept" });
    const now = Date.now();
    const authorized = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003", permissions: ["read", "manage_medication"], countryOfCare: "CO", timezone: "UTC", authorizationVersion: "m:1:a:1", issuedAt: new Date(now - 60_000), expiresAt: new Date(now + 60_000) });

    await repository.setPlanStatus(authorized, "00000000-0000-4000-8000-000000000030", "active", { careSpaceId: authorized.careSpaceId, childId: authorized.childId, actorUserId: authorized.actorUserId, operationKind: "confirm_plan", idempotencyKey: "confirm", digest: "a".repeat(64) });

    expect(rpcCalls[0]).toEqual(["transition_medication_plan", expect.objectContaining({ p_target_status: "active", p_input_fingerprint: "a".repeat(64) })]);
    expect(rpcCalls[0]?.[1]).not.toHaveProperty("p_status");
    expect(rpcCalls[0]?.[1]).not.toHaveProperty("p_input_digest");
  });

  it("preserves the durable replay receipt returned by a medication RPC", async () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: {
        id: "00000000-0000-4000-8000-000000000030",
        display_name: "Synthetic medication",
        medication_concept_id: "00000000-0000-4000-8000-000000000040",
        starts_at: "2026-08-21T08:00:00Z",
        status: "active",
        version: 1,
        recorded_by: "00000000-0000-4000-8000-000000000001",
        medication_concepts: { concept_code: "SYN-001", coding_system: "INVIMA" },
        medication_schedules: [],
      }, error: null }),
    };
    const client: any = {
      from: () => query,
      rpc: async () => ({
        data: [{ plan_id: "00000000-0000-4000-8000-000000000030", outcome: "idempotent_replay" }],
        error: null,
      }),
    };
    const repository = createMedicationRepository(client, { resolveConceptId: async () => "concept" });
    const now = Date.now();
    const authorized = createAuthorizedChildScopeFromTrustedRow({ actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003", permissions: ["read", "manage_medication"], countryOfCare: "CO", timezone: "UTC", authorizationVersion: "m:1:a:1", issuedAt: new Date(now - 60_000), expiresAt: new Date(now + 60_000) });
    const receipt = await repository.setPlanStatusWithOutcome(authorized, "00000000-0000-4000-8000-000000000030", "active", { careSpaceId: authorized.careSpaceId, childId: authorized.childId, actorUserId: authorized.actorUserId, operationKind: "confirm_plan", idempotencyKey: "confirm", digest: "a".repeat(64) });
    expect(receipt).toMatchObject({ outcome: "idempotent_replay", value: { id: "00000000-0000-4000-8000-000000000030", status: "active" } });
  });
});
