import { createHash } from "node:crypto";

import type { AccessDenied } from "../../../../agent/lib/access/access-denied";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import {
  createAuthorizedChildScopeFromTrustedRow,
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../../agent/lib/access/authorized-child-scope";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import { createSessionOwnershipRepository } from "../../../../agent/lib/access/session-ownership-repository";
import type { OwnedSessionRecord } from "../../../../agent/lib/access/session-record";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  createContinuationTokenKeyRing,
  issueContinuationToken,
  type ContinuationTokenKeyRing,
} from "../continuation-token";
import {
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_ERROR_VERSION,
  SESSION_CREATE_REQUEST_SCHEMA,
  SESSION_CREATE_RESPONSE_SCHEMA,
  negotiateClientCapabilities,
  type NegotiatedClientCapabilities,
} from "../types";

export const INITIAL_EVENT_CURSOR = "creciendo.initial-cursor.v1" as const;
const APPROVED_INITIAL_MODEL = "gemini-3.6-flash";
const MAX_INFLIGHT_CREATES = 10_000;

export type SessionCreateStoreResult =
  | Readonly<{ ok: true; outcome: "created" | "idempotent_replay"; session: OwnedSessionRecord }>
  | Readonly<{ ok: false; code: "conflict" | "unavailable"; effectState: "none" | "unknown" }>;

export interface SessionCreateStore {
  createOrReplay(input: Readonly<{
    scope: AuthorizedChildScope;
    auth: AuthenticatedChannelRequest;
    idempotencyKey: string;
    locale: "es-CO" | "en-US";
    capabilities: NegotiatedClientCapabilities;
    now: Date;
  }>): Promise<SessionCreateStoreResult>;
}

export type SessionCreateRouteDependencies = Readonly<{
  contextTokens: ChildContextTokenService;
  reauthorize(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, now: Date): Promise<AuthorizedChildScope | AccessDenied>;
  sessions: SessionCreateStore;
  continuationKeys: ContinuationTokenKeyRing;
  now?: () => Date;
}>;

type ErrorCode = "ACCESS_DENIED" | "REQUEST_INVALID" | "VERSION_UNSUPPORTED" | "CONFLICT" | "PERSISTENCE_UNAVAILABLE";

function safeError(status: number, code: ErrorCode, effectState: "none" | "committed" | "unknown" = "none"): Response {
  return Response.json({
    version: CRECIENDO_ERROR_VERSION,
    code,
    retryable: code === "PERSISTENCE_UNAVAILABLE" && effectState === "none",
    retryAfterSeconds: null,
    effectState,
    resumable: false,
  }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function hash(domain: string, values: readonly string[]): string {
  const digest = createHash("sha256");
  digest.update(`${domain}\n`, "utf8");
  for (const value of values) digest.update(`${value.length}:${value}\n`, "utf8");
  return digest.digest("hex");
}

function scopeFromVerified(value: Exclude<Awaited<ReturnType<ChildContextTokenService["verify"]>>, { ok: false }>): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: value.actorUserId,
    careSpaceId: value.careSpaceId,
    childId: value.childId,
    permissions: value.permissions,
    countryOfCare: value.countryOfCare,
    timezone: value.timezone,
    authorizationVersion: value.authorizationVersion,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  });
}

export async function handleCreateSession(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: SessionCreateRouteDependencies,
): Promise<Response> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return safeError(503, "PERSISTENCE_UNAVAILABLE");
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return safeError(400, "REQUEST_INVALID");
  }
  const parsed = SESSION_CREATE_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeError(400, "REQUEST_INVALID");
  const capabilities = negotiateClientCapabilities(parsed.data.capabilities);
  if (!capabilities) return safeError(400, "VERSION_UNSUPPORTED");

  let persistenceAttempted = false;
  let effectCommitted = false;
  try {
    const verified = await dependencies.contextTokens.verify(parsed.data.childContextToken, auth.guardian, now);
    if ("ok" in verified) return safeError(404, "ACCESS_DENIED");
    const signedScope = scopeFromVerified(verified);
    const freshScope = await dependencies.reauthorize(signedScope, auth, now);
    if ("ok" in freshScope) return safeError(404, "ACCESS_DENIED");
    persistenceAttempted = true;
    const stored = await dependencies.sessions.createOrReplay({
      scope: freshScope,
      auth,
      idempotencyKey: parsed.data.idempotencyKey,
      locale: parsed.data.locale,
      capabilities,
      now,
    });
    if (!stored.ok) return stored.code === "conflict"
      ? safeError(409, "CONFLICT")
      : safeError(503, "PERSISTENCE_UNAVAILABLE", stored.effectState);
    effectCommitted = true;
    const session = stored.session;
    if (session.eveSessionId !== null
      || session.status !== "active"
      || session.lastSequence !== 0
      || session.ownerUserId !== freshScope.actorUserId
      || session.careSpaceId !== freshScope.careSpaceId
      || session.childId !== freshScope.childId
      || session.authorizationVersion !== freshScope.authorizationVersion
      || session.authorizationExpiresAt <= now
      || session.authorizationExpiresAt > freshScope.expiresAt) return safeError(503, "PERSISTENCE_UNAVAILABLE");
    const continuationToken = await issueContinuationToken({ scope: freshScope, session, lastSequence: 0 }, dependencies.continuationKeys, now);
    const response = SESSION_CREATE_RESPONSE_SCHEMA.parse({
      version: CRECIENDO_CHANNEL_VERSION,
      requestId: auth.requestId,
      sessionId: session.productSessionId,
      continuationToken,
      cursor: INITIAL_EVENT_CURSOR,
      authorizationExpiresAt: session.authorizationExpiresAt.toISOString(),
      capabilities,
    });
    return Response.json(response, {
      status: stored.outcome === "created" ? 201 : 200,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return safeError(503, "PERSISTENCE_UNAVAILABLE", effectCommitted ? "committed" : persistenceAttempted ? "unknown" : "none");
  }
}

export function createSerializedSessionCreateStore(
  execute: (
    input: Parameters<SessionCreateStore["createOrReplay"]>[0],
    keySha256: string,
    requestSha256: string,
  ) => Promise<SessionCreateStoreResult>,
): SessionCreateStore {
  const inflight = new Map<string, Readonly<{ requestSha256: string; promise: Promise<SessionCreateStoreResult> }>>();

  const store: SessionCreateStore = {
    async createOrReplay(input) {
      const keySha256 = hash("creciendo-session-create-key.v1", [
        input.scope.actorUserId,
        input.scope.careSpaceId,
        input.scope.childId,
        input.idempotencyKey,
      ]);
      const requestSha256 = hash("creciendo-session-create-request.v1", [
        input.locale,
        input.capabilities.channelVersion,
        input.capabilities.eventVersion,
        input.capabilities.widgetVersions.join(","),
      ]);
      const active = inflight.get(keySha256);
      if (active) {
        if (active.requestSha256 !== requestSha256) return { ok: false as const, code: "conflict" as const, effectState: "none" as const };
        const result = await active.promise;
        return result.ok ? { ...result, outcome: "idempotent_replay" as const } : result;
      }
      if (inflight.size >= MAX_INFLIGHT_CREATES) return { ok: false as const, code: "unavailable" as const, effectState: "none" as const };
      const promise = execute(input, keySha256, requestSha256);
      inflight.set(keySha256, Object.freeze({ requestSha256, promise }));
      try {
        return await promise;
      } finally {
        inflight.delete(keySha256);
      }
    },
  };
  return Object.freeze(store);
}

function createSessionStore(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): SessionCreateStore {
  return createSerializedSessionCreateStore(async (input, keySha256, requestSha256) => {
    let createAttempted = false;
    try {
      const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
      const repository = createSessionOwnershipRepository(config, { createClient: () => client });
      const existing = await client
        .from("agent_sessions")
        .select("id, initial_configuration, status")
        .eq("owner_user_id", input.scope.actorUserId)
        .eq("care_space_id", input.scope.careSpaceId)
        .eq("child_id", input.scope.childId)
        .eq("channel", "creciendo_mobile")
        .contains("initial_configuration", { create_idempotency_sha256: keySha256 })
        .order("created_at", { ascending: true })
        .limit(2);
      if (existing.error || !Array.isArray(existing.data) || existing.data.length > 1) return { ok: false, code: "unavailable", effectState: "none" };
      if (existing.data.length === 1) {
        const row = existing.data[0];
        const configuration = row.initial_configuration;
        if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)
          || configuration.create_request_sha256 !== requestSha256
          || row.status !== "active") return { ok: false, code: "conflict", effectState: "none" };
        const found = await repository.findByProductId(input.scope, row.id, input.auth.requestId);
        return "ok" in found ? { ok: false, code: "unavailable", effectState: "none" } : { ok: true, outcome: "idempotent_replay", session: found };
      }
      createAttempted = true;
      const created = await repository.create(input.scope, {
        channel: "creciendo_mobile",
        initialModel: APPROVED_INITIAL_MODEL,
        initialConfiguration: {
          version: "creciendo.session-create.v1",
          channel_version: CRECIENDO_CHANNEL_VERSION,
          locale: input.locale,
          create_idempotency_sha256: keySha256,
          create_request_sha256: requestSha256,
        },
      }, input.auth.requestId);
      return "ok" in created ? { ok: false, code: "unavailable", effectState: "unknown" } : { ok: true, outcome: "created", session: created };
    } catch {
      return { ok: false, code: "unavailable", effectState: createAttempted ? "unknown" : "none" };
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

export function createSessionCreateRouteDependencies(config: RuntimeConfig): SessionCreateRouteDependencies {
  const contextTokens = createChildContextTokenService(config);
  const authorizeChild = createAuthorizeChildService(config);
  return Object.freeze({
    contextTokens,
    async reauthorize(signedScope, auth, now) {
      const fresh = await authorizeChild.authorize({
        guardian: auth.guardian,
        requestedChildId: signedScope.childId,
        requiredPermissions: ["record"],
        requestId: auth.requestId,
        now,
      });
      if ("ok" in fresh
        || !sameAuthorizedChildScope(signedScope, fresh)
        || !fresh.permissions.every((permission) => signedScope.permissions.includes(permission))
        || !hasPermission(fresh, "record", now)) return "ok" in fresh ? fresh : ({ ok: false, code: "ACCESS_DENIED", requestId: auth.requestId } as const);
      return fresh;
    },
    sessions: createSessionStore(config),
    continuationKeys: continuationKeys(config),
  });
}
