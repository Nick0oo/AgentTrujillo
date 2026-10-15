const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

export type ProjectionBatchEvent = Readonly<{ scope: Readonly<{ ownerUserId: string; careSpaceId: string; childId: string; productSessionId: string }>; sourceEventId: string; sourceEventVersion: string; sourceSequence: number; inputDigest: string; payload: unknown }>;
export type ProjectionBatchStore = Readonly<{ claim(input: Readonly<{ projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }>): Promise<Readonly<{ outcome: "claimed" | "completed" | "conflict" }>>; project(event: ProjectionBatchEvent): Promise<void>; commit(input: Readonly<{ projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }>): Promise<void>; fail(input: Readonly<{ projectorName: string; projectorVersion: string; event: ProjectionBatchEvent }>): Promise<void>; quarantine(input: Readonly<{ projectorName: string; projectorVersion: string; event: ProjectionBatchEvent; reason: "invalid_event" | "source_conflict" | "projection_failed" }>): Promise<void> }>;
export type ProjectionBatchRequest = Readonly<{ projectorName: string; projectorVersion: string; events: readonly ProjectionBatchEvent[] }>;
export type ProjectionBatchResult = Readonly<{ disposition: "completed" | "retryable" | "quarantined"; completed: number; replayed: number; pending: number; quarantined: number }>;

function validEvent(value: unknown): value is ProjectionBatchEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  const scope = event.scope;
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) return false;
  const scoped = scope as Record<string, unknown>;
  return typeof scoped.ownerUserId === "string" && UUID.test(scoped.ownerUserId)
    && typeof scoped.careSpaceId === "string" && UUID.test(scoped.careSpaceId)
    && typeof scoped.childId === "string" && UUID.test(scoped.childId)
    && typeof scoped.productSessionId === "string" && UUID.test(scoped.productSessionId)
    && typeof event.sourceEventId === "string" && OPAQUE.test(event.sourceEventId)
    && typeof event.sourceEventVersion === "string" && OPAQUE.test(event.sourceEventVersion)
    && typeof event.sourceSequence === "number" && Number.isSafeInteger(event.sourceSequence) && event.sourceSequence > 0
    && typeof event.inputDigest === "string" && DIGEST.test(event.inputDigest)
    && Object.hasOwn(event, "payload");
}

function result(disposition: ProjectionBatchResult["disposition"], completed: number, replayed: number, pending: number, quarantined: number): ProjectionBatchResult {
  return Object.freeze({ disposition, completed, replayed, pending, quarantined });
}

export async function runProjectionBatch(store: ProjectionBatchStore, request: ProjectionBatchRequest): Promise<ProjectionBatchResult> {
  if (!OPAQUE.test(request.projectorName) || !OPAQUE.test(request.projectorVersion) || request.events.length > 100) return result("quarantined", 0, 0, request.events.length, request.events.length);
  let completed = 0;
  let replayed = 0;
  let quarantined = 0;
  for (let index = 0; index < request.events.length; index += 1) {
    const event = request.events[index];
    if (!validEvent(event)) { quarantined += 1; continue; }
    const input = Object.freeze({ projectorName: request.projectorName, projectorVersion: request.projectorVersion, event });
    const claim = await store.claim(input);
    if (claim.outcome === "completed") { replayed += 1; continue; }
    if (claim.outcome === "conflict") { await store.quarantine({ ...input, reason: "source_conflict" }); quarantined += 1; continue; }
    try {
      await store.project(event);
      await store.commit(input);
      completed += 1;
    } catch (error) {
      if (typeof error === "object" && error !== null && (error as { retryable?: unknown }).retryable === true) {
        await store.fail(input);
        return result("retryable", completed, replayed, request.events.length - index, quarantined);
      }
      await store.quarantine({ ...input, reason: "projection_failed" });
      quarantined += 1;
      return result("quarantined", completed, replayed, request.events.length - index, quarantined);
    }
  }
  return result(quarantined > 0 ? "quarantined" : "completed", completed, replayed, 0, quarantined);
}
