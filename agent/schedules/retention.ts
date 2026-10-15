import { RetryableError } from "workflow";
import { defineSchedule } from "eve/schedules";

export const RETENTION_SCHEDULE = Object.freeze({
  cron: "0 * * * *",
  timeZone: "UTC",
  pageSize: 100,
  maxRuns: 100,
  lockKey: "retention-cleanup:v1",
});

export type RetentionCandidate = Readonly<{
  ownerUserId: string;
  careSpaceId: string;
  childId: string;
  memoryItemId: string;
  requestId: string;
  requestSha256: string;
  deadline: string;
  legalHold: false;
}>;

export type RetentionSchedulePorts = Readonly<{
  acquireLock(key: string): Promise<boolean>;
  discoverEligible(cursor: string | null, limit: number): Promise<Readonly<{ items: readonly RetentionCandidate[]; nextCursor: string | null }>>;
  startCleanupWorkflow(candidate: RetentionCandidate, idempotencyKey: string): Promise<Readonly<{ runId: string }>>;
  releaseLock(key: string): Promise<void>;
}>;

export type RetentionScheduleResult = Readonly<{
  status: "completed" | "overlap" | "retryable";
  started: number;
  failed: number;
  nextCursor: string | null;
}>;

let ports: RetentionSchedulePorts | null = null;
export function configureRetentionSchedulePorts(value: RetentionSchedulePorts | null): void { ports = value; }
function runtime(): RetentionSchedulePorts { if (!ports) throw new RetryableError("RETENTION_SCHEDULE_RUNTIME_UNAVAILABLE", { retryAfter: "60s" }); return ports; }
function validCandidate(candidate: RetentionCandidate): boolean {
  return Object.values(candidate).every((value) => typeof value === "string" || value === false)
    && candidate.legalHold === false
    && /^[a-f0-9]{64}$/u.test(candidate.requestSha256)
    && candidate.deadline.length > 0;
}

export function cleanupIdempotencyKey(candidate: RetentionCandidate): string {
  if (!validCandidate(candidate)) throw new Error("RETENTION_SCHEDULE_CANDIDATE_INVALID");
  return `retention:v1:${candidate.requestId}:${candidate.requestSha256}`;
}

export async function discoverEligible(cursor: string | null = null): Promise<Readonly<{ items: readonly RetentionCandidate[]; nextCursor: string | null }>> {
  let result: Awaited<ReturnType<RetentionSchedulePorts["discoverEligible"]>>;
  try { result = await runtime().discoverEligible(cursor, RETENTION_SCHEDULE.pageSize); } catch { throw new RetryableError("RETENTION_SCHEDULE_DISCOVERY_UNAVAILABLE", { retryAfter: "60s" }); }
  if (!Array.isArray(result.items) || result.items.length > RETENTION_SCHEDULE.pageSize || !result.items.every(validCandidate)
    || (result.nextCursor !== null && (typeof result.nextCursor !== "string" || result.nextCursor.length > 512))) {
    throw new Error("RETENTION_SCHEDULE_DISCOVERY_INVALID");
  }
  return Object.freeze({ items: Object.freeze([...result.items]), nextCursor: result.nextCursor });
}

export async function retentionSchedule(): Promise<RetentionScheduleResult> {
  const runtimePorts = runtime();
  let locked = false;
  try {
    try { locked = await runtimePorts.acquireLock(RETENTION_SCHEDULE.lockKey); } catch { throw new RetryableError("RETENTION_SCHEDULE_LOCK_UNAVAILABLE", { retryAfter: "60s" }); }
    if (!locked) return Object.freeze({ status: "overlap", started: 0, failed: 0, nextCursor: null });
    let cursor: string | null = null;
    let started = 0;
    let failed = 0;
    while (started + failed < RETENTION_SCHEDULE.maxRuns) {
      const page = await discoverEligible(cursor);
      for (const candidate of page.items) {
          if (started + failed >= RETENTION_SCHEDULE.maxRuns) return Object.freeze({ status: "completed", started, failed, nextCursor: page.nextCursor });
        try {
          const run = await runtimePorts.startCleanupWorkflow(candidate, cleanupIdempotencyKey(candidate));
          if (!run || typeof run.runId !== "string" || run.runId.length === 0 || run.runId.length > 256) throw new Error("run_id");
          started += 1;
        } catch {
          failed += 1;
        }
      }
      cursor = page.nextCursor;
      if (cursor === null || page.items.length === 0) return Object.freeze({ status: failed > 0 ? "retryable" : "completed", started, failed, nextCursor: cursor });
    }
    return Object.freeze({ status: failed > 0 ? "retryable" : "completed", started, failed, nextCursor: cursor });
  } finally {
    if (locked) await runtimePorts.releaseLock(RETENTION_SCHEDULE.lockKey).catch(() => undefined);
  }
}

export default defineSchedule({
  cron: RETENTION_SCHEDULE.cron,
  async run() {
    await retentionSchedule();
  },
});
