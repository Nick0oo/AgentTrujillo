import type { AccessDenied } from "../../../agent/lib/access/access-denied";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import { STREAM_ACCESS_RECHECK_MS } from "../../../agent/lib/access/stream-access-monitor";

export type StreamAccessSnapshot = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
}>;

export interface StreamRevocationScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type StreamInvalidationSubscription = (
  listener: () => void,
) => (() => void) | Promise<() => void>;

export type StreamRevocationDependencies = Readonly<{
  validate(): Promise<StreamAccessSnapshot | AccessDenied>;
  abortWork(): Promise<void> | void;
  subscribeInvalidation?: StreamInvalidationSubscription;
  scheduler?: StreamRevocationScheduler;
  now?: () => Date;
}>;

export interface StreamRevocationGuard {
  readonly signal: AbortSignal;
  subscribe(): Promise<boolean>;
  checkBeforeEvent(): Promise<boolean>;
  close(): Promise<void>;
}

const realScheduler: StreamRevocationScheduler = Object.freeze({
  setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});

function validSnapshot(
  boundScope: AuthorizedChildScope,
  boundSession: OwnedSessionRecord,
  snapshot: StreamAccessSnapshot | AccessDenied,
  now: Date,
): snapshot is StreamAccessSnapshot {
  if ("ok" in snapshot) return false;
  const { scope, session } = snapshot;
  return Number.isFinite(now.getTime())
    && scope.actorUserId === boundScope.actorUserId
    && scope.careSpaceId === boundScope.careSpaceId
    && scope.childId === boundScope.childId
    && scope.authorizationVersion === boundScope.authorizationVersion
    && scope.countryOfCare === boundScope.countryOfCare
    && scope.timezone === boundScope.timezone
    && scope.permissions.includes("read")
    && scope.permissions.every((permission) => boundScope.permissions.includes(permission))
    && scope.expiresAt > now
    && session.productSessionId === boundSession.productSessionId
    && session.ownerUserId === boundScope.actorUserId
    && session.careSpaceId === boundScope.careSpaceId
    && session.childId === boundScope.childId
    && session.authorizationVersion === boundScope.authorizationVersion
    && session.status === "active"
    && session.authorizationExpiresAt > now
    && session.authorizationExpiresAt <= scope.expiresAt
    && Number.isSafeInteger(session.lastSequence)
    && session.lastSequence >= boundSession.lastSequence
    && (boundSession.eveSessionId === null || session.eveSessionId === boundSession.eveSessionId);
}

export function createStreamRevocationGuard(
  scope: AuthorizedChildScope,
  session: OwnedSessionRecord,
  dependencies: StreamRevocationDependencies,
): StreamRevocationGuard {
  const scheduler = dependencies.scheduler ?? realScheduler;
  const abort = new AbortController();
  let state: "new" | "open" | "revoked" | "closed" = "new";
  let timer: unknown;
  let unsubscribe: (() => void) | undefined;
  let checking: Promise<boolean> | null = null;
  let abortWorkStarted = false;
  const acceptsEvents = () => state === "new" || state === "open";

  const clearResources = () => {
    if (timer !== undefined) {
      try {
        scheduler.clearTimeout(timer);
      } catch {
        // Cleanup is best-effort after byte suppression has already won.
      }
      timer = undefined;
    }
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // Subscription cleanup details are never exposed.
      }
      unsubscribe = undefined;
    }
  };

  const revoke = () => {
    if (state === "revoked" || state === "closed") return;
    state = "revoked";
    clearResources();
    if (!abort.signal.aborted) abort.abort();
    if (!abortWorkStarted) {
      abortWorkStarted = true;
      try {
        void Promise.resolve(dependencies.abortWork()).catch(() => undefined);
      } catch {
        // Work cancellation is cooperative; access-byte suppression is authoritative.
      }
    }
  };

  const check = (): Promise<boolean> => {
    if (state === "revoked" || state === "closed") return Promise.resolve(false);
    if (checking) return checking;
    const active = (async () => {
      try {
        const result = await dependencies.validate();
        if (!validSnapshot(scope, session, result, dependencies.now?.() ?? new Date())) {
          revoke();
          return false;
        }
        return acceptsEvents();
      } catch {
        revoke();
        return false;
      }
    })();
    checking = active;
    void active.finally(() => {
      if (checking === active) checking = null;
    });
    return active;
  };

  const schedule = () => {
    if (state !== "open" || timer !== undefined) return;
    try {
      timer = scheduler.setTimeout(() => {
        timer = undefined;
        void check().then((allowed) => {
          if (allowed) schedule();
        });
      }, STREAM_ACCESS_RECHECK_MS);
    } catch {
      revoke();
    }
  };

  return Object.freeze({
    signal: abort.signal,
    async subscribe() {
      if (state !== "new") return state === "open";
      state = "open";
      if (!(await check())) return false;
      if (dependencies.subscribeInvalidation) {
        try {
          unsubscribe = await dependencies.subscribeInvalidation(() => {
            void check();
          });
          if (typeof unsubscribe !== "function") {
            revoke();
            return false;
          }
        } catch {
          revoke();
          return false;
        }
      }
      // Closes the authorization race between the first query and subscription attachment.
      if (!(await check())) return false;
      schedule();
      return state === "open";
    },
    checkBeforeEvent: check,
    async close() {
      if (state === "closed") return;
      if (state !== "revoked") state = "closed";
      clearResources();
      if (checking) await checking.catch(() => false);
    },
  });
}
