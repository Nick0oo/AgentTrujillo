import { describe, expect, it, vi } from "vitest";

import { createAccessDenied } from "../../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import {
  createStreamRevocationGuard,
  type StreamRevocationScheduler,
} from "../../../src/channels/creciendo/stream-revocation";

const NOW = new Date("2026-08-24T14:00:00.000Z");
const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "10000000-0000-4000-8000-000000000001",
  careSpaceId: "20000000-0000-4000-8000-000000000002",
  childId: "30000000-0000-4000-8000-000000000003",
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 240_000),
});
const session: OwnedSessionRecord = Object.freeze({
  productSessionId: "40000000-0000-4000-8000-000000000004",
  eveSessionId: "eve-revocation-01",
  ownerUserId: scope.actorUserId,
  careSpaceId: scope.careSpaceId,
  childId: scope.childId,
  authorizationVersion: scope.authorizationVersion,
  authorizationExpiresAt: scope.expiresAt,
  status: "active",
  lastSequence: 2,
});

class FakeScheduler implements StreamRevocationScheduler {
  pending: Array<{ callback: () => void; delayMs: number }> = [];
  setTimeout = vi.fn((callback: () => void, delayMs: number) => {
    const handle = { callback, delayMs };
    this.pending.push(handle);
    return handle;
  });
  clearTimeout = vi.fn((handle: unknown) => {
    this.pending = this.pending.filter((candidate) => candidate !== handle);
  });
  async tick() {
    const next = this.pending.shift();
    next?.callback();
    await Promise.resolve();
    await Promise.resolve();
  }
}

function valid(lastSequence = session.lastSequence) {
  return Object.freeze({ scope, session: Object.freeze({ ...session, lastSequence }) });
}

describe("live stream revocation guard", () => {
  it("checks twice around subscription, before every frame, and schedules at the fixed 15-second maximum", async () => {
    const scheduler = new FakeScheduler();
    const validate = vi.fn(async () => valid(3));
    const unsubscribe = vi.fn();
    const subscribeInvalidation = vi.fn(() => unsubscribe);
    const guard = createStreamRevocationGuard(scope, session, {
      validate,
      abortWork: vi.fn(),
      subscribeInvalidation,
      scheduler,
      now: () => NOW,
    });

    expect(await guard.subscribe()).toBe(true);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(subscribeInvalidation).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(1);
    expect(scheduler.pending[0]!.delayMs).toBe(15_000);
    expect(await guard.checkBeforeEvent()).toBe(true);
    expect(validate).toHaveBeenCalledTimes(3);
    await guard.close();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(0);
    expect(guard.signal.aborted).toBe(false);
  });

  it("aborts bytes and Eve work exactly once on periodic denial without exposing the reason", async () => {
    const scheduler = new FakeScheduler();
    const validate = vi.fn()
      .mockResolvedValueOnce(valid())
      .mockResolvedValueOnce(valid())
      .mockResolvedValueOnce(createAccessDenied("private-revocation-reason"));
    const abortWork = vi.fn(async () => undefined);
    const guard = createStreamRevocationGuard(scope, session, { validate, abortWork, scheduler, now: () => NOW });
    expect(await guard.subscribe()).toBe(true);
    await scheduler.tick();
    expect(guard.signal.aborted).toBe(true);
    expect(String(guard.signal.reason)).not.toContain("private-revocation-reason");
    expect(abortWork).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(0);
    expect(await guard.checkBeforeEvent()).toBe(false);
    await guard.close();
    expect(abortWork).toHaveBeenCalledOnce();
  });

  it("fails closed on validator/subscription errors and invalid identity, version, permission or session progress", async () => {
    const invalid = [
      createAccessDenied("denied"),
      { scope: { ...scope, permissions: ["record"] }, session },
      { scope: { ...scope, authorizationVersion: "m:3:a:7" }, session },
      { scope, session: { ...session, childId: "30000000-0000-4000-8000-000000000099" } },
      { scope, session: { ...session, lastSequence: 1 } },
    ];
    for (const result of invalid) {
      const abortWork = vi.fn();
      const guard = createStreamRevocationGuard(scope, session, {
        validate: vi.fn(async () => result as never),
        abortWork,
        now: () => NOW,
      });
      expect(await guard.subscribe()).toBe(false);
      expect(guard.signal.aborted).toBe(true);
      expect(abortWork).toHaveBeenCalledOnce();
    }

    const unavailable = createStreamRevocationGuard(scope, session, {
      validate: vi.fn(async () => { throw new Error("database details"); }),
      abortWork: vi.fn(),
      now: () => NOW,
    });
    expect(await unavailable.subscribe()).toBe(false);
    expect(unavailable.signal.aborted).toBe(true);

    const subscriptionFailure = createStreamRevocationGuard(scope, session, {
      validate: vi.fn(async () => valid()),
      abortWork: vi.fn(),
      subscribeInvalidation: () => { throw new Error("realtime details"); },
      now: () => NOW,
    });
    expect(await subscriptionFailure.subscribe()).toBe(false);
    expect(subscriptionFailure.signal.aborted).toBe(true);
  });

  it("serializes concurrent checks and closes from one invalidation without later timers or validations", async () => {
    const scheduler = new FakeScheduler();
    let invalidation!: () => void;
    let release!: (value: ReturnType<typeof valid>) => void;
    const validate = vi.fn()
      .mockResolvedValueOnce(valid())
      .mockResolvedValueOnce(valid())
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce(createAccessDenied("revoked"));
    const abortWork = vi.fn();
    const guard = createStreamRevocationGuard(scope, session, {
      validate,
      abortWork,
      scheduler,
      subscribeInvalidation(listener) {
        invalidation = listener;
        return () => undefined;
      },
      now: () => NOW,
    });
    expect(await guard.subscribe()).toBe(true);
    const first = guard.checkBeforeEvent();
    const second = guard.checkBeforeEvent();
    expect(validate).toHaveBeenCalledTimes(3);
    release(valid(4));
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    invalidation();
    await Promise.resolve();
    await Promise.resolve();
    expect(guard.signal.aborted).toBe(true);
    expect(abortWork).toHaveBeenCalledOnce();
    expect(scheduler.pending).toHaveLength(0);
  });
});
