import { describe, expect, it, vi } from "vitest";

import { createAccessDenied } from "../../agent/lib/access/access-denied";
import { createStreamAccessMonitor, STREAM_ACCESS_RECHECK_MS, type StreamAccessScheduler } from "../../agent/lib/access/stream-access-monitor";
import type { AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";

const valid = { childId: "trusted" } as unknown as AuthorizedChildScope;

class FakeScheduler implements StreamAccessScheduler {
  pending: Array<{ callback: () => void; delayMs: number }> = [];
  setTimeout = vi.fn((callback: () => void, delayMs: number) => {
    const handle = { callback, delayMs };
    this.pending.push(handle);
    return handle;
  });
  clearTimeout = vi.fn((handle: unknown) => {
    this.pending = this.pending.filter((item) => item !== handle);
  });
  async tick() {
    const next = this.pending.shift();
    next?.callback();
    await Promise.resolve();
  }
}

describe("stream access monitor", () => {
  it("validates immediately and schedules no more than 15 seconds", async () => {
    const scheduler = new FakeScheduler();
    const validate = vi.fn().mockResolvedValue(valid);
    const abort = new AbortController();
    const cleanup = await createStreamAccessMonitor(scheduler).monitor({ validate, abort });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(scheduler.pending[0].delayMs).toBe(STREAM_ACCESS_RECHECK_MS);
    cleanup();
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
  });

  it("aborts exactly once and cleans timer on denial", async () => {
    const scheduler = new FakeScheduler();
    const validate = vi.fn().mockResolvedValueOnce(valid).mockResolvedValueOnce(createAccessDenied("denied"));
    const abort = new AbortController();
    const abortSpy = vi.spyOn(abort, "abort");
    await createStreamAccessMonitor(scheduler).monitor({ validate, abort });
    await scheduler.tick();
    expect(validate).toHaveBeenCalledTimes(2);
    expect(abort.signal.aborted).toBe(true);
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toHaveLength(0);
  });

  it("does not overlap checks and fails closed on validator errors", async () => {
    const scheduler = new FakeScheduler();
    let resolve!: (value: AuthorizedChildScope) => void;
    const validate = vi.fn().mockReturnValueOnce(new Promise<AuthorizedChildScope>((r) => { resolve = r; })).mockRejectedValueOnce(new Error("unavailable"));
    const abort = new AbortController();
    const monitorPromise = createStreamAccessMonitor(scheduler).monitor({ validate, abort });
    expect(validate).toHaveBeenCalledTimes(1);
    await scheduler.tick();
    expect(validate).toHaveBeenCalledTimes(1);
    resolve(valid);
    await monitorPromise;
    expect(scheduler.pending).toHaveLength(1);
    await scheduler.tick();
    expect(abort.signal.aborted).toBe(true);
  });

  it("honors pre-aborted and externally aborted streams without validation", async () => {
    const scheduler = new FakeScheduler();
    const validate = vi.fn().mockResolvedValue(valid);
    const abort = new AbortController();
    const external = new AbortController();
    external.abort();
    await createStreamAccessMonitor(scheduler).monitor({ validate, abort, signal: external.signal });
    expect(validate).not.toHaveBeenCalled();
    expect(abort.signal.aborted).toBe(false);
  });
});
