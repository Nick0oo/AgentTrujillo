import type { AuthenticationFailure, AuthenticatedGuardian } from "./authenticated-guardian";
import { AuthenticationError } from "./authenticated-guardian";
import type { AccessDenialResponse } from "./access-denial-response";
import { createAccessDenialResponse } from "./access-denial-response";
import type { AccessLeaseValidator, SessionOperation } from "./access-lease-validator";
import { createAuthorizedChildScopeFromTrustedRow, type AuthorizedChildScope } from "./authorized-child-scope";
import type { ChildContextTokenService } from "./child-context-token";
import type { SessionOwnershipRepository } from "./session-ownership-repository";
import type { OwnedSessionRecord } from "./session-record";
import type { StreamAccessMonitor } from "./stream-access-monitor";

export type CreateGuardInput = Readonly<{
  authorizationHeader: string | null;
  childContextToken: string;
  requestId: string;
  now?: Date;
}>;

export type ExistingGuardInput = Readonly<{
  authorizationHeader: string | null;
  childContextToken: string;
  sessionId: string;
  operation: Exclude<SessionOperation, "create">;
  requestId: string;
  now?: Date;
  stream?: Readonly<{ abort: AbortController; signal?: AbortSignal }>;
}>;

export type GuardedCreate = Readonly<{ guardian: AuthenticatedGuardian; scope: AuthorizedChildScope }>;
export type GuardedSession = Readonly<{
  guardian: AuthenticatedGuardian;
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
  stopStreamMonitor?: () => void;
}>;

export type GuardResult<T> = T | AuthenticationFailure | AccessDenialResponse;

export interface SessionRouteGuard {
  authorizeCreate(input: CreateGuardInput): Promise<GuardResult<GuardedCreate>>;
  authorizeExisting(input: ExistingGuardInput): Promise<GuardResult<GuardedSession>>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestId(value: string): string {
  return REQUEST_ID_PATTERN.test(value) ? value : "invalid-request-id";
}

function denial(value: string): AccessDenialResponse {
  return createAccessDenialResponse(requestId(value));
}

function scopeFromContext(context: Awaited<ReturnType<ChildContextTokenService["verify"]>> extends infer T
  ? Exclude<T, { ok: false }>
  : never): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: context.actorUserId,
    careSpaceId: context.careSpaceId,
    childId: context.childId,
    permissions: context.permissions,
    countryOfCare: context.countryOfCare,
    timezone: context.timezone,
    authorizationVersion: context.authorizationVersion,
    issuedAt: context.issuedAt,
    expiresAt: context.expiresAt,
  });
}

export function createSessionRouteGuard(dependencies: Readonly<{
  authenticator: { authenticateAuthorizationHeader(header: string | null, requestId: string, now?: Date): Promise<AuthenticatedGuardian> };
  contextTokens: ChildContextTokenService;
  leaseValidator: AccessLeaseValidator;
  sessions: SessionOwnershipRepository;
  streamMonitor: StreamAccessMonitor;
}>): SessionRouteGuard {
  async function authenticate(header: string | null, id: string, now?: Date): Promise<AuthenticatedGuardian | AuthenticationFailure> {
    try {
      return await dependencies.authenticator.authenticateAuthorizationHeader(header, requestId(id), now);
    } catch (error) {
      if (error instanceof AuthenticationError) return error.failure;
      return Object.freeze({ ok: false as const, code: "AUTHENTICATION_FAILED" as const, requestId: requestId(id) });
    }
  }

  async function verifiedScope(guardian: AuthenticatedGuardian, token: string, id: string, now?: Date): Promise<AuthorizedChildScope | AccessDenialResponse> {
    const context = await dependencies.contextTokens.verify(token, guardian, now);
    if ("ok" in context) return denial(id);
    try {
      return scopeFromContext(context);
    } catch {
      return denial(id);
    }
  }

  return {
    async authorizeCreate(input) {
      const id = requestId(input.requestId);
      const guardian = await authenticate(input.authorizationHeader, id, input.now);
      if ("ok" in guardian) return guardian;
      const scope = await verifiedScope(guardian, input.childContextToken, id, input.now);
      if ("status" in scope) return scope;
      const fresh = await dependencies.leaseValidator.validateForOperation({ guardian, signedScope: scope, operation: "create", requestId: id, now: input.now });
      return "ok" in fresh ? denial(id) : Object.freeze({ guardian, scope: fresh });
    },

    async authorizeExisting(input) {
      const id = requestId(input.requestId);
      const guardian = await authenticate(input.authorizationHeader, id, input.now);
      if ("ok" in guardian) return guardian;
      const scope = await verifiedScope(guardian, input.childContextToken, id, input.now);
      if ("status" in scope) return scope;
      if (!UUID_PATTERN.test(input.sessionId)) return denial(id);
      const session = await dependencies.sessions.findByProductId(scope, input.sessionId, id);
      if ("ok" in session) return denial(id);
      const fresh = await dependencies.leaseValidator.validateForOperation({ guardian, signedScope: scope, operation: input.operation, session, requestId: id, now: input.now });
      if ("ok" in fresh) return denial(id);

      let stopStreamMonitor: (() => void) | undefined;
      if (input.operation === "stream") {
        if (!input.stream) return denial(id);
        stopStreamMonitor = await dependencies.streamMonitor.monitor({
          abort: input.stream.abort,
          signal: input.stream.signal,
          validate: () => dependencies.leaseValidator.validateForOperation({ guardian, signedScope: scope, operation: "stream", session, requestId: id, now: input.now }),
        });
      }
      return Object.freeze({ guardian, scope: fresh, session, ...(stopStreamMonitor ? { stopStreamMonitor } : {}) });
    },
  };
}
