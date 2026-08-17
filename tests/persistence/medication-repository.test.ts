import { describe, expect, it } from "vitest";

import { executeMedicationOperation } from "../../src/persistence/supabase/medication-idempotency.ts";

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
});
