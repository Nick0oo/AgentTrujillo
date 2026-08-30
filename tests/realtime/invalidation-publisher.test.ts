import { describe, expect, it, vi } from "vitest";

import {
  INVALIDATION_RESOURCES,
  InvalidationPublisherError,
  publishInvalidation,
  type InvalidationTransaction,
} from "../../src/realtime/invalidation-publisher.ts";
import { createAuthorizedChildScopeFromTrustedRow, type AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope.ts";

const SPACE = "00000000-0000-4000-8000-000000000001";
const CHILD = "00000000-0000-4000-8000-000000000002";
const RESOURCE = "00000000-0000-4000-8000-000000000003";
const SOURCE = "00000000-0000-4000-8000-000000000004";
const SESSION = "00000000-0000-4000-8000-000000000005";

function scope(expiresAt = new Date(Date.now() + 60_000)): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: "00000000-0000-4000-8000-000000000006",
    careSpaceId: SPACE,
    childId: CHILD,
    permissions: ["read", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date(Date.now() - 60_000),
    expiresAt,
  });
}

function transaction(result: InvalidationTransaction["appendRealtimeInvalidation"] extends (...args: infer _Args) => infer _Result
  ? Awaited<ReturnType<InvalidationTransaction["appendRealtimeInvalidation"]>>
  : never): InvalidationTransaction & { appendRealtimeInvalidation: ReturnType<typeof vi.fn> } {
  return { appendRealtimeInvalidation: vi.fn().mockResolvedValue(result) } as unknown as InvalidationTransaction & { appendRealtimeInvalidation: ReturnType<typeof vi.fn> };
}

const input = { resourceKind: "growth" as const, resourceId: RESOURCE, version: 3, sourceEventId: SOURCE };

describe("publishInvalidation", () => {
  it("exposes only registered refetchable resources", () => {
    expect(Object.keys(INVALIDATION_RESOURCES)).toEqual([
      "child", "dashboard", "growth", "immunization", "medication",
      "development", "document", "conversation", "nutrition", "settings",
    ]);
  });

  it("appends one scoped invalidation through the caller transaction", async () => {
    const tx = transaction({ outcome: "created", invalidationId: 9, invalidationSequence: 4 });
    await expect(publishInvalidation(tx, scope(), input)).resolves.toEqual({ outcome: "created", invalidationId: 9, sequence: 4 });
    expect(tx.appendRealtimeInvalidation).toHaveBeenCalledWith({
      careSpaceId: SPACE, childId: CHILD, sessionId: null, resourceKind: "growth",
      resourceId: RESOURCE, resourceVersion: 3, sourceEventId: SOURCE,
    });
  });

  it("forwards an optional session scope without changing the resource contract", async () => {
    const tx = transaction({ outcome: "idempotent_replay", invalidationId: 10, invalidationSequence: 5 });
    await expect(publishInvalidation(tx, scope(), { ...input, sessionId: SESSION })).resolves.toMatchObject({ outcome: "idempotent_replay" });
    expect(tx.appendRealtimeInvalidation).toHaveBeenCalledWith(expect.objectContaining({ sessionId: SESSION }));
  });

  it("treats duplicate source replay as successful and conflicts as permanent", async () => {
    const replay = transaction({ outcome: "idempotent_replay", invalidationId: 9, invalidationSequence: 4 });
    await expect(publishInvalidation(replay, scope(), input)).resolves.toMatchObject({ outcome: "idempotent_replay" });
    const conflict = transaction({ outcome: "conflict", invalidationId: 9, invalidationSequence: 4 });
    await expect(publishInvalidation(conflict, scope(), input)).rejects.toMatchObject({ code: "INVALIDATION_CONFLICT", retryable: false });
  });

  it("rejects invalid input before opening an effect", async () => {
    const tx = transaction({ outcome: "created", invalidationId: 1, invalidationSequence: 1 });
    await expect(publishInvalidation(tx, scope(), { ...input, version: 0 })).rejects.toMatchObject({ code: "INVALIDATION_INPUT_INVALID", retryable: false });
    expect(tx.appendRealtimeInvalidation).not.toHaveBeenCalled();
  });

  it("rejects an expired authorization scope before publishing", async () => {
    const tx = transaction({ outcome: "created", invalidationId: 1, invalidationSequence: 1 });
    await expect(publishInvalidation(tx, scope(new Date(Date.now() - 1_000)), input)).rejects.toMatchObject({ code: "INVALIDATION_SCOPE_INACTIVE", retryable: false });
    expect(tx.appendRealtimeInvalidation).not.toHaveBeenCalled();
  });

  it("classifies transaction/provider failures as retryable", async () => {
    const tx = { appendRealtimeInvalidation: vi.fn().mockRejectedValue(new Error("temporary")) } as unknown as InvalidationTransaction;
    await expect(publishInvalidation(tx, scope(), input)).rejects.toMatchObject({ code: "INVALIDATION_APPEND_FAILED", retryable: true });
  });

  it("rejects malformed receipts instead of inventing an invalidation", async () => {
    const tx = transaction({ outcome: "created", invalidationId: null, invalidationSequence: null });
    await expect(publishInvalidation(tx, scope(), input)).rejects.toBeInstanceOf(InvalidationPublisherError);
  });
});
