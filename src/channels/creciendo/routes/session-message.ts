import { createHash, createHmac, randomUUID } from "node:crypto";

import type {
  GetSessionFn,
  RouteHandlerArgs,
  SendFn,
} from "eve/channels";
import { z } from "zod";

import type { AccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import {
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../../agent/lib/access/authorized-child-scope";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createSessionOwnershipRepository } from "../../../../agent/lib/access/session-ownership-repository";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import { AgeEngine } from "../../../clinical/anthropometry/chronological-age";
import { presentEmergencyRecommendation } from "../../../presentation/emergency-recommendation";
import { createRawGuardianMessage } from "../../../safety/message-schema";
import {
  SafetyPreflight,
  type EmergencyPackageProvider,
} from "../../../safety/preflight";
import { createTrustedSafetyContextFromAuthorizedScope } from "../../../safety/safety-context";
import type { TrustedSafetyContext } from "../../../safety/message-types";
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
  SESSION_MESSAGE_REQUEST_SCHEMA,
  SESSION_MESSAGE_RESPONSE_SCHEMA,
  negotiateClientCapabilities,
  type EventCursor,
} from "../types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_INFLIGHT_MESSAGES = 10_000;

type MessagePart = Readonly<{ type: "text"; text: string }>;

export type SessionMessageAuthorization = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
  trustedContext: TrustedSafetyContext;
}>;

type StoreCommon = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
  auth: AuthenticatedChannelRequest;
  sessionId: string;
  clientMessageId: string;
  idempotencyKeySha256: string;
  requestSha256: string;
  now: Date;
}>;

export type SessionMessageStoreInput = StoreCommon & (
  | Readonly<{
    kind: "continue";
    parts: readonly MessagePart[];
  }>
  | Readonly<{
    kind: "emergency";
    safetyReceiptSha256: string;
    terminalEvent: Readonly<{
      type: "emergency-recommendation";
      terminal: true;
      widget: ReturnType<typeof presentEmergencyRecommendation>;
    }>;
  }>
);

export type SessionMessageStoreResult =
  | Readonly<{
    ok: true;
    outcome: "created" | "idempotent_replay";
    dispatchRequired: boolean;
    session: OwnedSessionRecord;
    messageId: string;
    turnId: string;
    acceptedAt: Date;
    cursor: EventCursor | string;
  }>
  | Readonly<{
    ok: false;
    code: "conflict" | "unavailable";
    effectState: "none" | "unknown";
  }>;

export interface SessionMessageStore {
  acceptOrReplay(input: SessionMessageStoreInput): Promise<SessionMessageStoreResult>;
}

export interface EveMessageDispatcher {
  resolve(session: OwnedSessionRecord): Promise<string | null>;
  dispatch(input: Readonly<{
    session: OwnedSessionRecord;
    auth: AuthenticatedChannelRequest;
    parts: readonly MessagePart[];
  }>): Promise<Readonly<{ eveSessionId: string }>>;
}

export type SessionMessageRouteDependencies = Readonly<{
  sessionId: string;
  authorizeSession(input: Readonly<{
    sessionId: string;
    auth: AuthenticatedChannelRequest;
    now: Date;
  }>): Promise<SessionMessageAuthorization | AccessDenied>;
  revalidateSession(
    authorization: SessionMessageAuthorization,
    auth: AuthenticatedChannelRequest,
    now: Date,
  ): Promise<boolean>;
  messages: SessionMessageStore;
  preflight: Pick<SafetyPreflight, "evaluate" | "consumePermit">;
  packages: EmergencyPackageProvider;
  eve: EveMessageDispatcher;
  bindEveSession(input: Readonly<{
    scope: AuthorizedChildScope;
    session: OwnedSessionRecord;
    eveSessionId: string;
    auth: AuthenticatedChannelRequest;
  }>): Promise<OwnedSessionRecord | AccessDenied>;
  continuationKeys: ContinuationTokenKeyRing;
  now?: () => Date;
}>;

export type SessionMessageRouteBaseDependencies = Omit<SessionMessageRouteDependencies, "sessionId" | "eve">;

type ErrorCode =
  | "ACCESS_DENIED"
  | "REQUEST_INVALID"
  | "VERSION_UNSUPPORTED"
  | "CONFLICT"
  | "PROVIDER_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

function safeError(
  status: number,
  code: ErrorCode,
  effectState: "none" | "committed" | "unknown" = "none",
): Response {
  const retryable = (code === "PROVIDER_UNAVAILABLE" || code === "PERSISTENCE_UNAVAILABLE")
    && effectState === "none";
  return Response.json({
    version: CRECIENDO_ERROR_VERSION,
    code,
    retryable,
    retryAfterSeconds: null,
    effectState,
    resumable: effectState !== "none" && code !== "ACCESS_DENIED",
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

function validSessionRecord(record: OwnedSessionRecord, authorization: SessionMessageAuthorization, now: Date): boolean {
  return record.productSessionId === authorization.session.productSessionId
    && record.ownerUserId === authorization.scope.actorUserId
    && record.careSpaceId === authorization.scope.careSpaceId
    && record.childId === authorization.scope.childId
    && record.authorizationVersion === authorization.scope.authorizationVersion
    && record.status === "active"
    && record.authorizationExpiresAt > now
    && record.authorizationExpiresAt <= authorization.scope.expiresAt
    && Number.isSafeInteger(record.lastSequence)
    && record.lastSequence >= authorization.session.lastSequence;
}

function responseFor(
  auth: AuthenticatedChannelRequest,
  stored: Extract<SessionMessageStoreResult, { ok: true }>,
  continuationToken: string,
): Response {
  const response = SESSION_MESSAGE_RESPONSE_SCHEMA.parse({
    version: CRECIENDO_CHANNEL_VERSION,
    requestId: auth.requestId,
    sessionId: stored.session.productSessionId,
    turnId: stored.turnId,
    messageId: stored.messageId,
    outcome: stored.outcome === "created" ? "accepted" : "idempotent_replay",
    acceptedAt: stored.acceptedAt.toISOString(),
    continuationToken,
    cursor: EVENT_CURSOR_SCHEMA.parse(stored.cursor),
  });
  return Response.json(response, {
    status: stored.outcome === "created" ? 202 : 200,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function requestHashes(input: Readonly<{
  scope: AuthorizedChildScope;
  sessionId: string;
  idempotencyKey: string;
  clientMessageId: string;
  parts: readonly MessagePart[];
  capabilities: NonNullable<ReturnType<typeof negotiateClientCapabilities>>;
}>): Readonly<{ idempotencyKeySha256: string; requestSha256: string }> {
  return Object.freeze({
    idempotencyKeySha256: hash("creciendo-session-message-key.v1", [
      input.scope.actorUserId,
      input.scope.careSpaceId,
      input.scope.childId,
      input.sessionId,
      input.idempotencyKey,
    ]),
    requestSha256: hash("creciendo-session-message-request.v1", [
      input.clientMessageId,
      JSON.stringify(input.parts),
      input.capabilities.channelVersion,
      input.capabilities.eventVersion,
      input.capabilities.widgetVersions.join(","),
    ]),
  });
}

export async function handleSessionMessage(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: SessionMessageRouteDependencies,
): Promise<Response> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return safeError(503, "PERSISTENCE_UNAVAILABLE");
  let persistenceAttempted = false;
  let commandCommitted = false;
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return safeError(400, "REQUEST_INVALID");
  }
  const parsed = SESSION_MESSAGE_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success || !UUID.test(dependencies.sessionId)) return safeError(400, "REQUEST_INVALID");
  const capabilities = negotiateClientCapabilities(parsed.data.capabilities);
  if (!capabilities) return safeError(400, "VERSION_UNSUPPORTED");

  try {
    const authorization = await dependencies.authorizeSession({
      sessionId: dependencies.sessionId,
      auth,
      now,
    });
    if ("ok" in authorization) return safeError(404, "ACCESS_DENIED");
    const continuation = await verifyContinuationToken(
      parsed.data.continuationToken,
      { scope: authorization.scope, session: authorization.session },
      dependencies.continuationKeys,
      now,
    );
    if (!continuation.ok) return safeError(404, "ACCESS_DENIED");

    const access = Object.freeze({
      validate: async () => dependencies.revalidateSession(authorization, auth, now),
    });
    const rawMessage = createRawGuardianMessage({
      text: parsed.data.parts.map((part) => part.text).join("\n"),
      locale: authorization.trustedContext.locale,
      source: "guardian_follow_up",
      requestId: auth.requestId,
    });
    const preflight = await dependencies.preflight.evaluate({
      requestId: auth.requestId,
      sessionId: authorization.session.productSessionId,
      rawMessage,
      trustedContext: authorization.trustedContext,
      access,
      packages: dependencies.packages,
      signal: request.signal,
    }, request.signal);
    if (preflight.kind === "denied") return safeError(404, "ACCESS_DENIED");

    const hashes = requestHashes({
      scope: authorization.scope,
      sessionId: authorization.session.productSessionId,
      idempotencyKey: parsed.data.idempotencyKey,
      clientMessageId: parsed.data.clientMessageId,
      parts: parsed.data.parts,
      capabilities,
    });
    let storeInput: SessionMessageStoreInput;
    if (preflight.kind === "terminal") {
      if (preflight.response.type !== "emergency_recommendation"
        || preflight.response.decision.decision !== "urgent") {
        return safeError(503, "PROVIDER_UNAVAILABLE");
      }
      const urgentDecision = Object.freeze({
        decision: preflight.response.decision.decision,
        responseMode: preflight.response.decision.responseMode,
        ruleCodes: preflight.response.decision.ruleCodes,
        copyKey: preflight.response.decision.copyKey,
      });
      const widget = presentEmergencyRecommendation(urgentDecision, authorization.trustedContext.locale);
      storeInput = Object.freeze({
        kind: "emergency" as const,
        scope: authorization.scope,
        session: authorization.session,
        auth,
        sessionId: authorization.session.productSessionId,
        clientMessageId: parsed.data.clientMessageId,
        ...hashes,
        safetyReceiptSha256: hash("creciendo-emergency-safety-receipt.v1", [
          urgentDecision.ruleCodes.join(","),
          urgentDecision.copyKey,
          JSON.stringify(preflight.decisionEvidence),
        ]),
        terminalEvent: Object.freeze({
          type: "emergency-recommendation" as const,
          terminal: true as const,
          widget,
        }),
        now,
      });
    } else {
      try {
        await dependencies.preflight.consumePermit({
          permit: preflight.permit,
          authorization: { requestId: auth.requestId, sessionId: authorization.session.productSessionId },
          access,
          scopeFingerprint: authorization.trustedContext.scopeFingerprint,
          signal: request.signal,
        });
      } catch {
        return safeError(404, "ACCESS_DENIED");
      }
      storeInput = Object.freeze({
        kind: "continue" as const,
        scope: authorization.scope,
        session: authorization.session,
        auth,
        sessionId: authorization.session.productSessionId,
        clientMessageId: parsed.data.clientMessageId,
        ...hashes,
        parts: Object.freeze(parsed.data.parts.map((part) => Object.freeze({ ...part }))),
        now,
      });
    }

    persistenceAttempted = true;
    const stored = await dependencies.messages.acceptOrReplay(storeInput);
    if (!stored.ok) return stored.code === "conflict"
      ? safeError(409, "CONFLICT")
      : safeError(503, "PERSISTENCE_UNAVAILABLE", stored.effectState);
    commandCommitted = true;
    if ((storeInput.kind === "emergency" && stored.dispatchRequired)
      || (storeInput.kind === "continue" && stored.outcome === "created" && !stored.dispatchRequired)
      || (stored.outcome === "idempotent_replay" && stored.dispatchRequired)) {
      return safeError(503, "PERSISTENCE_UNAVAILABLE", "committed");
    }

    let finalSession = stored.session;
    if (storeInput.kind === "continue" && stored.dispatchRequired) {
      if (!(await dependencies.revalidateSession(authorization, auth, now))) {
        return safeError(404, "ACCESS_DENIED", "committed");
      }
      let dispatched: Readonly<{ eveSessionId: string }>;
      try {
        dispatched = await dependencies.eve.dispatch({
          session: stored.session,
          auth,
          parts: storeInput.parts,
        });
      } catch {
        return safeError(503, "PROVIDER_UNAVAILABLE", "committed");
      }
      if (!dispatched.eveSessionId || dispatched.eveSessionId.length > 200) {
        return safeError(503, "PROVIDER_UNAVAILABLE", "committed");
      }
      if (stored.session.eveSessionId !== null) {
        if (stored.session.eveSessionId !== dispatched.eveSessionId) {
          return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
        }
      } else {
        let bound: OwnedSessionRecord | AccessDenied;
        try {
          bound = await dependencies.bindEveSession({
            scope: authorization.scope,
            session: stored.session,
            eveSessionId: dispatched.eveSessionId,
            auth,
          });
        } catch {
          return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
        }
        if ("ok" in bound || bound.eveSessionId !== dispatched.eveSessionId) {
          return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
        }
        finalSession = bound;
      }
    } else if (storeInput.kind === "continue" && stored.session.eveSessionId === null) {
      const resolved = await dependencies.eve.resolve(stored.session);
      if (resolved !== null) {
        let bound: OwnedSessionRecord | AccessDenied;
        try {
          bound = await dependencies.bindEveSession({
            scope: authorization.scope,
            session: stored.session,
            eveSessionId: resolved,
            auth,
          });
        } catch {
          return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
        }
        if ("ok" in bound || bound.eveSessionId !== resolved) {
          return safeError(503, "PERSISTENCE_UNAVAILABLE", "unknown");
        }
        finalSession = bound;
      }
    }

    const complete = Object.freeze({ ...stored, session: finalSession });
    if (!validSessionRecord(finalSession, authorization, now)
      || !(stored.acceptedAt instanceof Date)
      || !Number.isFinite(stored.acceptedAt.getTime())
      || !UUID.test(stored.messageId)
      || !UUID.test(stored.turnId)) return safeError(503, "PERSISTENCE_UNAVAILABLE", "committed");
    const rotated = await rotateContinuationToken(parsed.data.continuationToken, {
      scope: authorization.scope,
      session: finalSession,
      lastSequence: finalSession.lastSequence,
    }, dependencies.continuationKeys, now);
    if (!rotated.ok) return safeError(503, "PERSISTENCE_UNAVAILABLE", "committed");
    try {
      return responseFor(auth, complete, rotated.token);
    } catch {
      return safeError(503, "PERSISTENCE_UNAVAILABLE", "committed");
    }
  } catch {
    return safeError(
      503,
      "PERSISTENCE_UNAVAILABLE",
      commandCommitted ? "committed" : persistenceAttempted ? "unknown" : "none",
    );
  }
}

export function createSerializedSessionMessageStore(
  execute: (input: SessionMessageStoreInput) => Promise<SessionMessageStoreResult>,
): SessionMessageStore {
  const inflight = new Map<string, Readonly<{
    requestSha256: string;
    promise: Promise<SessionMessageStoreResult>;
  }>>();
  return Object.freeze({
    async acceptOrReplay(input: SessionMessageStoreInput) {
      if (!HASH.test(input.idempotencyKeySha256) || !HASH.test(input.requestSha256)) {
        return { ok: false as const, code: "unavailable" as const, effectState: "none" as const };
      }
      const active = inflight.get(input.idempotencyKeySha256);
      if (active) {
        if (active.requestSha256 !== input.requestSha256) {
          return { ok: false as const, code: "conflict" as const, effectState: "none" as const };
        }
        const result = await active.promise;
        return result.ok
          ? { ...result, outcome: "idempotent_replay" as const, dispatchRequired: false }
          : result;
      }
      if (inflight.size >= MAX_INFLIGHT_MESSAGES) {
        return { ok: false as const, code: "unavailable" as const, effectState: "none" as const };
      }
      const promise = execute(input);
      inflight.set(input.idempotencyKeySha256, Object.freeze({ requestSha256: input.requestSha256, promise }));
      try {
        return await promise;
      } finally {
        inflight.delete(input.idempotencyKeySha256);
      }
    },
  });
}

const RPC_ROW = z.object({
  outcome: z.enum(["created", "idempotent_replay", "conflict"]),
  dispatch_required: z.boolean(),
  message_id: z.string().uuid().nullable(),
  turn_id: z.string().uuid().nullable(),
  accepted_at: z.string().datetime({ offset: true }).nullable(),
  cursor: z.string().min(16).max(4_096).nullable(),
  last_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  eve_session_id: z.string().min(1).max(200).nullable(),
}).strict();

function createMessageStore(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): SessionMessageStore {
  return createSerializedSessionMessageStore(async (input) => {
    let rpcAttempted = false;
    try {
      const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
      const rpc = (client as unknown as {
        rpc(name: string, args: Record<string, unknown>): Promise<Readonly<{ data: unknown; error: Readonly<{ message?: string }> | null }>>;
      }).rpc.bind(client);
      rpcAttempted = true;
      const result = await rpc("accept_creciendo_session_message", {
        p_product_session_id: input.sessionId,
        p_care_space_id: input.scope.careSpaceId,
        p_child_id: input.scope.childId,
        p_authorization_version: input.scope.authorizationVersion,
        p_client_message_id: input.clientMessageId,
        p_idempotency_key_sha256: input.idempotencyKeySha256,
        p_request_sha256: input.requestSha256,
        p_proposed_turn_id: randomUUID(),
        p_command_kind: input.kind,
        p_parts: input.kind === "continue" ? input.parts : null,
        p_safety_receipt_sha256: input.kind === "emergency" ? input.safetyReceiptSha256 : null,
        p_terminal_event: input.kind === "emergency"
          ? { type: input.terminalEvent.type, terminal: true, data: { widget: input.terminalEvent.widget } }
          : null,
      });
      if (result.error) {
        const missing = /accept_creciendo_session_message|schema cache|PGRST202/iu.test(result.error.message ?? "");
        return { ok: false as const, code: "unavailable" as const, effectState: missing ? "none" as const : "unknown" as const };
      }
      if (!Array.isArray(result.data) || result.data.length !== 1) {
        return { ok: false as const, code: "unavailable" as const, effectState: "unknown" as const };
      }
      const parsed = RPC_ROW.safeParse(result.data[0]);
      if (!parsed.success) return { ok: false as const, code: "unavailable" as const, effectState: "unknown" as const };
      if (parsed.data.outcome === "conflict") {
        return { ok: false as const, code: "conflict" as const, effectState: "none" as const };
      }
      const acceptedAt = parsed.data.accepted_at ? new Date(parsed.data.accepted_at) : null;
      if (!parsed.data.message_id || !parsed.data.turn_id || !parsed.data.cursor
        || parsed.data.last_sequence === null || !acceptedAt || !Number.isFinite(acceptedAt.getTime())
        || parsed.data.last_sequence < input.session.lastSequence) {
        return { ok: false as const, code: "unavailable" as const, effectState: "unknown" as const };
      }
      const updatedSession = Object.freeze({
        ...input.session,
        eveSessionId: parsed.data.eve_session_id,
        lastSequence: parsed.data.last_sequence,
      });
      return {
        ok: true as const,
        outcome: parsed.data.outcome,
        dispatchRequired: parsed.data.dispatch_required,
        session: updatedSession,
        messageId: parsed.data.message_id,
        turnId: parsed.data.turn_id,
        acceptedAt,
        cursor: parsed.data.cursor,
      };
    } catch {
      return {
        ok: false as const,
        code: "unavailable" as const,
        effectState: rpcAttempted ? "unknown" as const : "none" as const,
      };
    }
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

export function createEveMessageDispatcher(
  helpers: Readonly<{
    send: SendFn;
    resolveActiveSession: RouteHandlerArgs["resolveActiveSession"];
    getSession: GetSessionFn;
  }>,
  config: RuntimeConfig,
): EveMessageDispatcher {
  if (!config.childContextSigningKey) throw new Error("CHANNEL_SIGNING_UNAVAILABLE");
  const candidateTokens = (session: OwnedSessionRecord): readonly string[] => Object.freeze([
    internalToken(config.childContextSigningKey!, session.productSessionId),
    ...(config.childContextPreviousSigningKey
      ? [internalToken(config.childContextPreviousSigningKey, session.productSessionId)]
      : []),
  ]);
  async function locate(session: OwnedSessionRecord): Promise<Readonly<{ eveSessionId: string; token: string }> | null> {
    if (session.eveSessionId !== null) {
      const token = helpers.getSession(session.eveSessionId).continuationToken;
      const resolved = await helpers.resolveActiveSession({ continuationToken: token });
      return resolved?.sessionId === session.eveSessionId ? { eveSessionId: resolved.sessionId, token } : null;
    }
    for (const token of candidateTokens(session)) {
      const resolved = await helpers.resolveActiveSession({ continuationToken: token });
      if (resolved) return { eveSessionId: resolved.sessionId, token };
    }
    return null;
  }
  return Object.freeze({
    async resolve(session: OwnedSessionRecord) {
      return (await locate(session))?.eveSessionId ?? null;
    },
    async dispatch(input: Parameters<EveMessageDispatcher["dispatch"]>[0]) {
      const existing = await locate(input.session);
      if (input.session.eveSessionId !== null && !existing) throw new Error("EVE_SESSION_UNAVAILABLE");
      if (input.session.eveSessionId === null && existing) return { eveSessionId: existing.eveSessionId };
      const token = existing?.token ?? candidateTokens(input.session)[0]!;
      const principal = Object.freeze({
        attributes: Object.freeze({}),
        authenticator: "supabase-jwt",
        issuer: config.supabaseJwtIssuer,
        principalId: input.auth.guardian.userId,
        principalType: "user",
        subject: input.auth.guardian.userId,
      });
      const result = await helpers.send([...input.parts], {
        auth: principal,
        initiatorAuth: principal,
        continuationToken: token,
        mode: "conversation",
        title: "Creciendo session",
      });
      return Object.freeze({ eveSessionId: result.id });
    },
  });
}

function createProductionAuthorization(config: RuntimeConfig) {
  const authorizeChild = createAuthorizeChildService(config);
  return {
    async authorizeSession(input: Readonly<{ sessionId: string; auth: AuthenticatedChannelRequest; now: Date }>): Promise<SessionMessageAuthorization | AccessDenied> {
      try {
        const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
        const locator = await client.from("agent_sessions")
          .select("id, child_id, initial_configuration")
          .eq("id", input.sessionId)
          .eq("owner_user_id", input.auth.guardian.userId)
          .maybeSingle();
        if (locator.error || !locator.data) return createAccessDenied(input.auth.requestId);
        const fresh = await authorizeChild.authorize({
          guardian: input.auth.guardian,
          requestedChildId: locator.data.child_id,
          requiredPermissions: ["read", "record"],
          requestId: input.auth.requestId,
          now: input.now,
        });
        if ("ok" in fresh) return fresh;
        const repository = createSessionOwnershipRepository(config, { createClient: () => client });
        const found = await repository.findByProductId(fresh, input.sessionId, input.auth.requestId);
        if ("ok" in found) return found;
        const session = await repository.refreshLease(fresh, input.sessionId, input.auth.requestId);
        if ("ok" in session || session.status !== "active" || session.authorizationExpiresAt <= input.now) {
          return createAccessDenied(input.auth.requestId);
        }
        const configuration = locator.data.initial_configuration;
        const locale = configuration && typeof configuration === "object" && !Array.isArray(configuration)
          ? configuration.locale
          : null;
        if (locale !== "es-CO" && locale !== "en-US") return createAccessDenied(input.auth.requestId);
        const child = await client.from("children")
          .select("id, care_space_id, date_of_birth, country_of_care, time_zone, status")
          .eq("id", fresh.childId)
          .eq("care_space_id", fresh.careSpaceId)
          .eq("status", "active")
          .maybeSingle();
        if (child.error || !child.data
          || child.data.country_of_care !== fresh.countryOfCare
          || child.data.time_zone !== fresh.timezone) return createAccessDenied(input.auth.requestId);
        const age = AgeEngine.calculateChronologicalAge({
          birthDate: child.data.date_of_birth,
          birthDatePrecision: "date",
          referenceInstant: input.now.toISOString(),
          timeZone: fresh.timezone,
        });
        const trustedContext = createTrustedSafetyContextFromAuthorizedScope(fresh, {
          chronologicalAgeDays: age.ageDays,
          correctedAgeDays: null,
          locale,
          timezone: fresh.timezone,
          referenceInstant: input.now,
        });
        return Object.freeze({ scope: fresh, session, trustedContext });
      } catch {
        return createAccessDenied(input.auth.requestId);
      }
    },
    async revalidateSession(authorization: SessionMessageAuthorization, auth: AuthenticatedChannelRequest, now: Date): Promise<boolean> {
      try {
        const fresh = await authorizeChild.authorize({
          guardian: auth.guardian,
          requestedChildId: authorization.scope.childId,
          requiredPermissions: ["read", "record"],
          requestId: auth.requestId,
          now,
        });
        if ("ok" in fresh || !sameAuthorizedChildScope(authorization.scope, fresh)) return false;
        const client = createRequestSupabaseClient({ config, accessToken: auth.guardian.bearerToken });
        const repository = createSessionOwnershipRepository(config, { createClient: () => client });
        const stored = await repository.refreshLease(fresh, authorization.session.productSessionId, auth.requestId);
        return !("ok" in stored)
          && stored.ownerUserId === auth.guardian.userId
          && stored.status === "active"
          && stored.authorizationExpiresAt > now
          && stored.authorizationExpiresAt <= fresh.expiresAt
          && stored.lastSequence >= authorization.session.lastSequence
          && stored.eveSessionId === authorization.session.eveSessionId;
      } catch {
        return false;
      }
    },
  };
}

export function createSessionMessageRouteDependencies(config: RuntimeConfig): SessionMessageRouteBaseDependencies {
  const authorization = createProductionAuthorization(config);
  const packages: EmergencyPackageProvider = Object.freeze({
    // Module 04 intentionally has no activated real emergency package. Its
    // approved production behavior is fail closed until governance activates one.
    resolve: () => null,
  });
  return Object.freeze({
    ...authorization,
    messages: createMessageStore(config),
    preflight: new SafetyPreflight(),
    packages,
    async bindEveSession(input) {
      const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
      const repository = createSessionOwnershipRepository(config, { createClient: () => client });
      return repository.bindEveSession(
        input.scope,
        input.session.productSessionId,
        input.eveSessionId,
        input.auth.requestId,
      );
    },
    continuationKeys: continuationKeys(config),
  });
}
