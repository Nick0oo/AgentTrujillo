import { createHash, createHmac } from "node:crypto";

import type { CancelFn, GetSessionFn, RouteHandlerArgs } from "eve/channels";
import { z } from "zod";

import type { AccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import type { AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createSessionOwnershipRepository } from "../../../../agent/lib/access/session-ownership-repository";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  createContinuationTokenKeyRing,
  rotateContinuationToken,
  verifyContinuationToken,
  type ContinuationTokenKeyRing,
} from "../continuation-token";
import {
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_ERROR_VERSION,
  EVENT_CURSOR_SCHEMA,
  SESSION_CANCEL_REQUEST_SCHEMA,
  SESSION_CANCEL_RESPONSE_SCHEMA,
  type SessionCancelResponse,
} from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;

export type SessionCancellationAuthorization = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
}>;

type CancellationOutcome = SessionCancelResponse["outcome"];
type CancellationEffectState = SessionCancelResponse["effectState"];

type CancelStoreFailure = Readonly<{
  ok: false;
  code: "access_denied" | "conflict" | "unavailable";
  effectState: "none" | "unknown";
}>;

export type CancelAcceptResult = Readonly<{
  ok: true;
  outcome: "created" | "idempotent_replay";
  finalizeRequired: boolean;
  operationId: string;
  turnId: string;
  acceptedAt: Date;
  cancellationOutcome: CancellationOutcome | null;
  effectState: CancellationEffectState | null;
  cursor: string;
  session: OwnedSessionRecord;
}> | CancelStoreFailure;

export type CancelFinalizeResult = Readonly<{
  ok: true;
  outcome: "created" | "idempotent_replay";
  operationId: string;
  turnId: string;
  cancellationOutcome: CancellationOutcome;
  effectState: CancellationEffectState;
  occurredAt: Date;
  cursor: string;
  session: OwnedSessionRecord;
}> | CancelStoreFailure;

type CancelAcceptInput = Readonly<{
  authorization: SessionCancellationAuthorization;
  auth: AuthenticatedChannelRequest;
  operationId: string;
  reason: "user_requested" | "navigation" | "session_closed";
  idempotencyKeySha256: string;
  requestSha256: string;
}>;

type CancelFinalizeInput = Readonly<{
  authorization: SessionCancellationAuthorization;
  auth: AuthenticatedChannelRequest;
  operationId: string;
  cancellationOutcome: "requested" | "effect_may_have_committed";
  effectState: "unknown";
}>;

export interface SessionCancelStore {
  acceptOrReplay(input: CancelAcceptInput): Promise<CancelAcceptResult>;
  finalizeOrReplay(input: CancelFinalizeInput): Promise<CancelFinalizeResult>;
}

export interface EveCancellationPort {
  cancel(input: Readonly<{
    authorization: SessionCancellationAuthorization;
    turnId: string;
  }>): Promise<Readonly<{ status: "accepted" | "no_active_turn" }>>;
}

export type SessionCancelRouteDependencies = Readonly<{
  sessionId: string;
  continuationKeys: ContinuationTokenKeyRing;
  authorizeSession(input: Readonly<{
    sessionId: string;
    auth: AuthenticatedChannelRequest;
    now: Date;
  }>): Promise<SessionCancellationAuthorization | AccessDenied>;
  store: SessionCancelStore;
  eve: EveCancellationPort;
  now?: () => Date;
}>;

export type SessionCancelRouteBaseDependencies = Omit<SessionCancelRouteDependencies, "sessionId" | "eve">;

type ErrorCode = "ACCESS_DENIED" | "REQUEST_INVALID" | "CONFLICT" | "PERSISTENCE_UNAVAILABLE";

function safeError(status: number, code: ErrorCode, effectState: "none" | "unknown" = "none"): Response {
  return Response.json({
    version: CRECIENDO_ERROR_VERSION,
    code,
    retryable: code === "PERSISTENCE_UNAVAILABLE" && effectState === "none",
    retryAfterSeconds: null,
    effectState,
    resumable: code === "PERSISTENCE_UNAVAILABLE" && effectState === "unknown",
  }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function hash(domain: string, values: readonly string[]): string {
  const digest = createHash("sha256");
  digest.update(`${domain}\n`, "utf8");
  for (const value of values) digest.update(`${value.length}:${value}\n`, "utf8");
  return digest.digest("hex");
}

function requestHashes(input: Readonly<{
  authorization: SessionCancellationAuthorization;
  operationId: string;
  reason: string;
  idempotencyKey: string;
}>): Readonly<{ idempotencyKeySha256: string; requestSha256: string }> {
  const trusted = input.authorization;
  return Object.freeze({
    idempotencyKeySha256: hash("creciendo-session-cancel-key.v1", [
      trusted.scope.actorUserId,
      trusted.scope.careSpaceId,
      trusted.scope.childId,
      trusted.session.productSessionId,
      input.idempotencyKey,
    ]),
    requestSha256: hash("creciendo-session-cancel-request.v1", [
      input.operationId,
      input.reason,
      CRECIENDO_CHANNEL_VERSION,
    ]),
  });
}

function validAuthorization(
  authorization: SessionCancellationAuthorization,
  auth: AuthenticatedChannelRequest,
  sessionId: string,
  now: Date,
): boolean {
  const { scope, session } = authorization;
  return scope.actorUserId === auth.guardian.userId
    && session.productSessionId === sessionId
    && session.ownerUserId === auth.guardian.userId
    && session.careSpaceId === scope.careSpaceId
    && session.childId === scope.childId
    && session.authorizationVersion === scope.authorizationVersion
    && scope.permissions.includes("read")
    && scope.permissions.includes("record")
    && scope.expiresAt > now
    && session.authorizationExpiresAt > now
    && session.authorizationExpiresAt <= scope.expiresAt
    && session.status === "active"
    && Number.isSafeInteger(session.lastSequence)
    && session.lastSequence >= 0;
}

function validSessionProgress(
  next: OwnedSessionRecord,
  authorization: SessionCancellationAuthorization,
  now: Date,
): boolean {
  const { session, scope } = authorization;
  return next.productSessionId === session.productSessionId
    && next.ownerUserId === scope.actorUserId
    && next.careSpaceId === scope.careSpaceId
    && next.childId === scope.childId
    && next.authorizationVersion === scope.authorizationVersion
    && next.authorizationExpiresAt > now
    && next.authorizationExpiresAt <= scope.expiresAt
    && next.status === "active"
    && Number.isSafeInteger(next.lastSequence)
    && next.lastSequence >= session.lastSequence;
}

function resultResponse(
  auth: AuthenticatedChannelRequest,
  result: Extract<CancelFinalizeResult, { ok: true }> | Extract<CancelAcceptResult, { ok: true }>,
  continuationToken: string,
): Response {
  if (result.cancellationOutcome === null || result.effectState === null) throw new Error("CANCEL_RESULT_INVALID");
  const response = SESSION_CANCEL_RESPONSE_SCHEMA.parse({
    version: CRECIENDO_CHANNEL_VERSION,
    requestId: auth.requestId,
    sessionId: result.session.productSessionId,
    operationId: result.operationId,
    outcome: result.cancellationOutcome,
    effectState: result.effectState,
    continuationToken,
    cursor: EVENT_CURSOR_SCHEMA.parse(result.cursor),
  });
  return Response.json(response, {
    status: response.outcome === "requested" ? 202 : 200,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function storeFailure(result: CancelStoreFailure): Response {
  if (result.code === "access_denied") return safeError(404, "ACCESS_DENIED");
  if (result.code === "conflict") return safeError(409, "CONFLICT", result.effectState);
  return safeError(503, "PERSISTENCE_UNAVAILABLE", result.effectState);
}

export async function handleCancelSession(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: SessionCancelRouteDependencies,
): Promise<Response> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return safeError(503, "PERSISTENCE_UNAVAILABLE");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return safeError(400, "REQUEST_INVALID");
  }
  const parsed = SESSION_CANCEL_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success || !UUID.test(dependencies.sessionId)) return safeError(400, "REQUEST_INVALID");

  let persistenceAttempted = false;
  let ticketCommitted = false;
  try {
    const authorization = await dependencies.authorizeSession({
      sessionId: dependencies.sessionId,
      auth,
      now,
    });
    if ("ok" in authorization || !validAuthorization(authorization, auth, dependencies.sessionId, now)) {
      return safeError(404, "ACCESS_DENIED");
    }
    const continuation = await verifyContinuationToken(
      parsed.data.continuationToken,
      authorization,
      dependencies.continuationKeys,
      now,
    );
    if (!continuation.ok) return safeError(404, "ACCESS_DENIED");

    const hashes = requestHashes({
      authorization,
      operationId: parsed.data.operationId,
      reason: parsed.data.reason,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    persistenceAttempted = true;
    const accepted = await dependencies.store.acceptOrReplay({
      authorization,
      auth,
      operationId: parsed.data.operationId,
      reason: parsed.data.reason,
      ...hashes,
    });
    if (!accepted.ok) return storeFailure(accepted);
    ticketCommitted = true;
    if (accepted.operationId !== parsed.data.operationId
      || !UUID.test(accepted.turnId)
      || !(accepted.acceptedAt instanceof Date)
      || !Number.isFinite(accepted.acceptedAt.getTime())
      || !validSessionProgress(accepted.session, authorization, now)) {
      return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
    }

    let finalResult: Extract<CancelFinalizeResult, { ok: true }> | Extract<CancelAcceptResult, { ok: true }> = accepted;
    if (accepted.finalizeRequired) {
      let cancellationOutcome: "requested" | "effect_may_have_committed" = "effect_may_have_committed";
      if (!request.signal.aborted) {
        try {
          const signaled = await dependencies.eve.cancel({ authorization, turnId: accepted.turnId });
          if (signaled.status === "accepted") cancellationOutcome = "requested";
        } catch {
          cancellationOutcome = "effect_may_have_committed";
        }
      }
      const finalized = await dependencies.store.finalizeOrReplay({
        authorization,
        auth,
        operationId: accepted.operationId,
        cancellationOutcome,
        effectState: "unknown",
      });
      if (!finalized.ok) return storeFailure(finalized);
      if (finalized.operationId !== accepted.operationId
        || finalized.turnId !== accepted.turnId
        || !(finalized.occurredAt instanceof Date)
        || !Number.isFinite(finalized.occurredAt.getTime())
        || !validSessionProgress(finalized.session, authorization, now)) {
        return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
      }
      finalResult = finalized;
    }

    if (finalResult.cancellationOutcome === null || finalResult.effectState === null) {
      return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
    }
    const rotated = await rotateContinuationToken(parsed.data.continuationToken, {
      scope: authorization.scope,
      session: finalResult.session,
      lastSequence: finalResult.session.lastSequence,
    }, dependencies.continuationKeys, now);
    if (!rotated.ok) return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
    return resultResponse(auth, finalResult, rotated.token);
  } catch {
    return safeError(
      503,
      "PERSISTENCE_UNAVAILABLE",
      ticketCommitted || persistenceAttempted ? "unknown" : "none",
    );
  }
}

const ACCEPT_ROW_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay", "conflict"]),
  finalize_required: z.boolean(),
  operation_id: z.string().uuid().nullable(),
  turn_id: z.string().uuid().nullable(),
  accepted_at: z.string().datetime({ offset: true }).nullable(),
  cancellation_outcome: z.enum(["requested", "already_terminal", "cancelled_before_effect", "effect_may_have_committed"]).nullable(),
  effect_state: z.enum(["none", "committed", "unknown"]).nullable(),
  cursor: z.string().min(16).max(4_096).nullable(),
  last_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();

const FINALIZE_ROW_SCHEMA = z.object({
  outcome: z.enum(["created", "idempotent_replay", "conflict"]),
  operation_id: z.string().uuid().nullable(),
  turn_id: z.string().uuid().nullable(),
  cancellation_outcome: z.enum(["requested", "already_terminal", "cancelled_before_effect", "effect_may_have_committed"]).nullable(),
  effect_state: z.enum(["none", "committed", "unknown"]).nullable(),
  occurred_at: z.string().datetime({ offset: true }).nullable(),
  cursor: z.string().min(16).max(4_096).nullable(),
  last_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
}).strict();

type RpcClient = Readonly<{
  rpc(name: string, args: Record<string, unknown>): Promise<Readonly<{
    data: unknown;
    error: Readonly<{ message?: string }> | null;
  }>>;
}>;

function updatedSession(session: OwnedSessionRecord, lastSequence: number): OwnedSessionRecord {
  return Object.freeze({ ...session, lastSequence });
}

function createCancelStore(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): SessionCancelStore {
  return Object.freeze({
    async acceptOrReplay(input: CancelAcceptInput): Promise<CancelAcceptResult> {
      let attempted = false;
      try {
        if (!HASH.test(input.idempotencyKeySha256) || !HASH.test(input.requestSha256)) {
          return Object.freeze({ ok: false, code: "unavailable", effectState: "none" });
        }
        const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
        attempted = true;
        const result = await (client as unknown as RpcClient).rpc("accept_creciendo_session_cancel", {
          p_product_session_id: input.authorization.session.productSessionId,
          p_care_space_id: input.authorization.scope.careSpaceId,
          p_child_id: input.authorization.scope.childId,
          p_authorization_version: input.authorization.scope.authorizationVersion,
          p_operation_id: input.operationId,
          p_idempotency_key_sha256: input.idempotencyKeySha256,
          p_request_sha256: input.requestSha256,
          p_reason: input.reason,
        });
        if (result.error) return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        if (!Array.isArray(result.data) || result.data.length !== 1) {
          return Object.freeze({ ok: false, code: "access_denied", effectState: "none" });
        }
        const parsed = ACCEPT_ROW_SCHEMA.safeParse(result.data[0]);
        if (!parsed.success) return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        if (parsed.data.outcome === "conflict") return Object.freeze({ ok: false, code: "conflict", effectState: "none" });
        const acceptedAt = parsed.data.accepted_at ? new Date(parsed.data.accepted_at) : null;
        if (!parsed.data.operation_id || !parsed.data.turn_id || !acceptedAt
          || !Number.isFinite(acceptedAt.getTime()) || !parsed.data.cursor || parsed.data.last_sequence === null) {
          return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        }
        return Object.freeze({
          ok: true,
          outcome: parsed.data.outcome,
          finalizeRequired: parsed.data.finalize_required,
          operationId: parsed.data.operation_id,
          turnId: parsed.data.turn_id,
          acceptedAt,
          cancellationOutcome: parsed.data.cancellation_outcome,
          effectState: parsed.data.effect_state,
          cursor: parsed.data.cursor,
          session: updatedSession(input.authorization.session, parsed.data.last_sequence),
        });
      } catch {
        return Object.freeze({ ok: false, code: "unavailable", effectState: attempted ? "unknown" : "none" });
      }
    },
    async finalizeOrReplay(input: CancelFinalizeInput): Promise<CancelFinalizeResult> {
      try {
        const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
        const result = await (client as unknown as RpcClient).rpc("finalize_creciendo_session_cancel", {
          p_product_session_id: input.authorization.session.productSessionId,
          p_care_space_id: input.authorization.scope.careSpaceId,
          p_child_id: input.authorization.scope.childId,
          p_authorization_version: input.authorization.scope.authorizationVersion,
          p_operation_id: input.operationId,
          p_cancellation_outcome: input.cancellationOutcome,
          p_effect_state: input.effectState,
        });
        if (result.error) return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        if (!Array.isArray(result.data) || result.data.length !== 1) {
          return Object.freeze({ ok: false, code: "access_denied", effectState: "none" });
        }
        const parsed = FINALIZE_ROW_SCHEMA.safeParse(result.data[0]);
        if (!parsed.success) return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        if (parsed.data.outcome === "conflict") return Object.freeze({ ok: false, code: "conflict", effectState: "unknown" });
        const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : null;
        if (!parsed.data.operation_id || !parsed.data.turn_id || !parsed.data.cancellation_outcome
          || !parsed.data.effect_state || !occurredAt || !Number.isFinite(occurredAt.getTime())
          || !parsed.data.cursor || parsed.data.last_sequence === null) {
          return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
        }
        return Object.freeze({
          ok: true,
          outcome: parsed.data.outcome,
          operationId: parsed.data.operation_id,
          turnId: parsed.data.turn_id,
          cancellationOutcome: parsed.data.cancellation_outcome,
          effectState: parsed.data.effect_state,
          occurredAt,
          cursor: parsed.data.cursor,
          session: updatedSession(input.authorization.session, parsed.data.last_sequence),
        });
      } catch {
        return Object.freeze({ ok: false, code: "unavailable", effectState: "unknown" });
      }
    },
  });
}

function continuationKeys(config: RuntimeConfig): ContinuationTokenKeyRing {
  if (!config.childContextSigningKey || !config.childContextSigningKid) throw new Error("CHANNEL_SIGNING_UNAVAILABLE");
  const kid = (value: string) => `ct.${hash("creciendo-continuation-kid.v1", [value]).slice(0, 16)}`;
  return createContinuationTokenKeyRing({
    current: { kid: kid(config.childContextSigningKid), secret: config.childContextSigningKey },
    ...(config.childContextPreviousSigningKey && config.childContextPreviousSigningKid
      ? { previous: { kid: kid(config.childContextPreviousSigningKid), secret: config.childContextPreviousSigningKey } }
      : {}),
  });
}

function internalToken(secret: string, productSessionId: string): string {
  return `creciendo.eve.v1.${createHmac("sha256", secret)
    .update("creciendo-eve-continuation.v1\n", "utf8")
    .update(productSessionId, "utf8")
    .digest("base64url")}`;
}

export function createEveCancellationPort(
  helpers: Readonly<{
    cancel: CancelFn;
    resolveActiveSession: RouteHandlerArgs["resolveActiveSession"];
    getSession: GetSessionFn;
  }>,
  config: RuntimeConfig,
): EveCancellationPort {
  if (!config.childContextSigningKey) throw new Error("CHANNEL_SIGNING_UNAVAILABLE");
  return Object.freeze({
    async cancel(input: Parameters<EveCancellationPort["cancel"]>[0]) {
      if (input.authorization.session.eveSessionId !== null) {
        const session = helpers.getSession(input.authorization.session.eveSessionId);
        const resolved = await helpers.resolveActiveSession({ continuationToken: session.continuationToken });
        if (resolved?.sessionId !== input.authorization.session.eveSessionId) {
          return Object.freeze({ status: "no_active_turn" as const });
        }
        return session.cancel({ turnId: input.turnId });
      }
      const tokens = [
        internalToken(config.childContextSigningKey!, input.authorization.session.productSessionId),
        ...(config.childContextPreviousSigningKey
          ? [internalToken(config.childContextPreviousSigningKey, input.authorization.session.productSessionId)]
          : []),
      ];
      for (const continuationToken of tokens) {
        const resolved = await helpers.resolveActiveSession({ continuationToken });
        if (resolved) return helpers.cancel({ continuationToken, turnId: input.turnId });
      }
      return Object.freeze({ status: "no_active_turn" as const });
    },
  });
}

export function createSessionCancelRouteDependencies(config: RuntimeConfig): SessionCancelRouteBaseDependencies {
  const authorizeChild = createAuthorizeChildService(config);
  return Object.freeze({
    continuationKeys: continuationKeys(config),
    store: createCancelStore(config),
    async authorizeSession(input): Promise<SessionCancellationAuthorization | AccessDenied> {
      try {
        if (!UUID.test(input.sessionId)) return createAccessDenied(input.auth.requestId);
        const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
        const locator = await client.from("agent_sessions")
          .select("id, child_id")
          .eq("id", input.sessionId)
          .eq("owner_user_id", input.auth.guardian.userId)
          .eq("channel", "creciendo_mobile")
          .maybeSingle();
        if (locator.error || !locator.data) return createAccessDenied(input.auth.requestId);
        const scope = await authorizeChild.authorize({
          guardian: input.auth.guardian,
          requestedChildId: locator.data.child_id,
          requiredPermissions: ["read", "record"],
          requestId: input.auth.requestId,
          now: input.now,
        });
        if ("ok" in scope) return scope;
        const repository = createSessionOwnershipRepository(config, { createClient: () => client });
        const session = await repository.refreshLease(scope, input.sessionId, input.auth.requestId);
        if ("ok" in session || session.status !== "active" || session.authorizationExpiresAt <= input.now) {
          return createAccessDenied(input.auth.requestId);
        }
        return Object.freeze({ scope, session });
      } catch {
        return createAccessDenied(input.auth.requestId);
      }
    },
  });
}
