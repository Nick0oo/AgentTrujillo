import { createHash, randomUUID } from "node:crypto";

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
  verifyContinuationToken,
  type ContinuationTokenKeyRing,
} from "../continuation-token";
import { createNdjsonStream, NDJSON_CONTENT_TYPE } from "../ndjson-encoder";
import { mapPreStreamError } from "../stream-error-mapper";
import {
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_EVENT_VERSION,
  parseChannelEvent,
  type ChannelEvent,
} from "../types";
import { INITIAL_EVENT_CURSOR } from "./session-create";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_CONTINUATION_BYTES = 4_096;
const MAX_CURSOR_BYTES = 4_096;
const DEFAULT_PAGE_SIZE = 128;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_DURATION_MS = 25_000;

export type SessionStreamAuthorization = Readonly<{
  scope: AuthorizedChildScope;
  session: OwnedSessionRecord;
}>;

export type PersistedChannelEvent = Readonly<{
  eventId: string;
  version: string;
  type: string;
  terminal: boolean;
  turnId: string;
  sequence: number;
  occurredAt: string;
  cursor: string;
  data: unknown;
}>;

export type StreamCursorResolution =
  | Readonly<{
    ok: true;
    afterSequence: number;
    firstAvailableSequence: number;
    lastSequence: number;
    terminalEventId: string | null;
  }>
  | Readonly<{ ok: false; code: "ACCESS_DENIED" | "CURSOR_INVALID" | "RETENTION_GAP" | "PERSISTENCE_UNAVAILABLE" }>;

type StreamAuthorizationInput = Readonly<{
  sessionId: string;
  auth: AuthenticatedChannelRequest;
  now: Date;
}>;

type StreamReadInput = Readonly<{
  authorization: SessionStreamAuthorization;
  auth: AuthenticatedChannelRequest;
  afterSequence: number;
  limit: number;
  signal: AbortSignal;
}>;

export type SessionStreamRouteDependencies = Readonly<{
  sessionId: string;
  continuationKeys: ContinuationTokenKeyRing;
  authorizeSession(input: StreamAuthorizationInput): Promise<SessionStreamAuthorization | AccessDenied>;
  resolveCursor(input: Readonly<{
    authorization: SessionStreamAuthorization;
    auth: AuthenticatedChannelRequest;
    cursor: string;
    signal: AbortSignal;
  }>): Promise<StreamCursorResolution>;
  readEvents(input: StreamReadInput): Promise<readonly PersistedChannelEvent[]>;
  now?: () => Date;
  pollIntervalMs?: number;
  maxDurationMs?: number;
}>;

export type SessionStreamRouteBaseDependencies = Omit<SessionStreamRouteDependencies, "sessionId">;

const PERSISTED_EVENT_SCHEMA = z.object({
  eventId: z.string().uuid(),
  version: z.literal(CRECIENDO_EVENT_VERSION),
  type: z.string().min(1).max(64),
  terminal: z.boolean(),
  turnId: z.string().uuid(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.string().datetime({ offset: true }),
  cursor: z.string().min(16).max(MAX_CURSOR_BYTES),
  data: z.unknown(),
}).strict();

const CURSOR_ROW_SCHEMA = z.object({
  outcome: z.enum(["valid", "invalid", "retention_gap"]),
  after_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  first_available_sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  last_sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  terminal_event_id: z.string().uuid().nullable(),
}).strict();

const EVENT_ROW_SCHEMA = z.object({
  event_id: z.string().uuid(),
  version: z.string(),
  type: z.string(),
  terminal: z.boolean(),
  turn_id: z.string().uuid(),
  sequence: z.number().int(),
  occurred_at: z.string(),
  cursor: z.string(),
  data: z.unknown(),
}).strict();

class SessionStreamError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SessionStreamError";
  }
}

function safeErrorResponse(raw: unknown, auth: AuthenticatedChannelRequest): Response {
  const mapped = mapPreStreamError(raw, {
    requestId: auth.requestId,
    errorId: randomUUID(),
    effectState: "none",
    persistedSequence: null,
    persistedCursor: null,
    retryAfterSeconds: null,
  });
  const headers = new Headers(mapped.headers);
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return new Response(JSON.stringify(mapped.body), { status: mapped.status, headers });
}

function validAccept(raw: string | null): boolean {
  if (raw === null) return true;
  return raw.split(",").some((entry) => {
    const mediaType = entry.split(";", 1)[0]?.trim().toLowerCase();
    return mediaType === "application/x-ndjson" || mediaType === "application/*" || mediaType === "*/*";
  });
}

function parseHeaders(request: Request): Readonly<{ continuationToken: string; cursor: string }> {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    throw new SessionStreamError("REQUEST_INVALID");
  }
  const continuationToken = request.headers.get("x-continuation-token");
  const cursor = request.headers.get("last-event-id") ?? INITIAL_EVENT_CURSOR;
  if (request.method !== "GET"
    || url.search !== ""
    || request.body !== null
    || request.headers.get("x-creciendo-channel-version") !== CRECIENDO_CHANNEL_VERSION
    || request.headers.get("x-creciendo-event-version") !== CRECIENDO_EVENT_VERSION) {
    throw new SessionStreamError(
      request.headers.get("x-creciendo-channel-version") !== CRECIENDO_CHANNEL_VERSION
        || request.headers.get("x-creciendo-event-version") !== CRECIENDO_EVENT_VERSION
        ? "VERSION_UNSUPPORTED"
        : "REQUEST_INVALID",
    );
  }
  if (!validAccept(request.headers.get("accept"))
    || continuationToken === null
    || continuationToken.length < 16
    || new TextEncoder().encode(continuationToken).byteLength > MAX_CONTINUATION_BYTES
    || /[\s\u0000-\u001f\u007f,]/u.test(continuationToken)
    || cursor.length < 16
    || new TextEncoder().encode(cursor).byteLength > MAX_CURSOR_BYTES
    || /[\r\n\u0000]/u.test(cursor)) {
    throw new SessionStreamError("REQUEST_INVALID");
  }
  return Object.freeze({ continuationToken, cursor });
}

function validateTiming(dependencies: SessionStreamRouteDependencies) {
  const pollIntervalMs = dependencies.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxDurationMs = dependencies.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 5_000
    || !Number.isInteger(maxDurationMs) || maxDurationMs < 1 || maxDurationMs > 120_000) {
    throw new SessionStreamError("INTERNAL_UNAVAILABLE");
  }
  return Object.freeze({ pollIntervalMs, maxDurationMs });
}

function validatePage(
  raw: readonly PersistedChannelEvent[],
  sessionId: string,
  afterSequence: number,
): readonly ChannelEvent[] {
  if (!Array.isArray(raw) || raw.length > 256) throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
  const events: ChannelEvent[] = [];
  const eventIds = new Set<string>();
  let expected = afterSequence + 1;
  for (let index = 0; index < raw.length; index += 1) {
    const parsed = PERSISTED_EVENT_SCHEMA.safeParse(raw[index]);
    if (!parsed.success
      || parsed.data.sequence !== expected
      || parsed.data.cursor !== parsed.data.eventId
      || eventIds.has(parsed.data.eventId)
      || (parsed.data.terminal && index !== raw.length - 1)) {
      throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
    }
    const event = parseChannelEvent({
      version: parsed.data.version,
      eventId: parsed.data.eventId,
      sessionId,
      turnId: parsed.data.turnId,
      sequence: parsed.data.sequence,
      occurredAt: parsed.data.occurredAt,
      cursor: parsed.data.cursor,
      type: parsed.data.type,
      terminal: parsed.data.terminal,
      data: parsed.data.data,
    });
    eventIds.add(event.eventId);
    events.push(event);
    expected += 1;
  }
  return Object.freeze(events);
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new SessionStreamError("CANCELLED"));
      return;
    }
    const timer = setTimeout(done, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new SessionStreamError("CANCELLED"));
    };
    function done() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function* streamEvents(input: Readonly<{
  initial: readonly ChannelEvent[];
  afterSequence: number;
  terminalAlreadySeen: boolean;
  authorization: SessionStreamAuthorization;
  auth: AuthenticatedChannelRequest;
  dependencies: SessionStreamRouteDependencies;
  pollIntervalMs: number;
  maxDurationMs: number;
  signal: AbortSignal;
  onClose: () => void;
}>): AsyncGenerator<ChannelEvent> {
  let page = input.initial;
  let afterSequence = input.afterSequence;
  const deadline = Date.now() + input.maxDurationMs;
  const seenEventIds = new Set(page.map((event) => event.eventId));
  try {
    if (input.terminalAlreadySeen) return;
    while (true) {
      for (const event of page) {
        yield event;
        afterSequence = event.sequence;
        if (event.terminal) return;
      }
      if (Date.now() >= deadline || input.signal.aborted) return;
      await abortableDelay(Math.min(input.pollIntervalMs, Math.max(1, deadline - Date.now())), input.signal);
      const raw = await input.dependencies.readEvents({
        authorization: input.authorization,
        auth: input.auth,
        afterSequence,
        limit: DEFAULT_PAGE_SIZE,
        signal: input.signal,
      });
      page = validatePage(raw, input.dependencies.sessionId, afterSequence);
      for (const event of page) {
        if (seenEventIds.has(event.eventId)) throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
        seenEventIds.add(event.eventId);
      }
    }
  } finally {
    input.onClose();
  }
}

export async function handleSessionStream(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: SessionStreamRouteDependencies,
): Promise<Response> {
  try {
    if (!UUID.test(dependencies.sessionId)) throw new SessionStreamError("ACCESS_DENIED");
    const timing = validateTiming(dependencies);
    const headers = parseHeaders(request);
    const now = dependencies.now?.() ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new SessionStreamError("INTERNAL_UNAVAILABLE");
    const authorization = await dependencies.authorizeSession({ sessionId: dependencies.sessionId, auth, now });
    if ("ok" in authorization) throw new SessionStreamError("ACCESS_DENIED");
    if (authorization.session.productSessionId !== dependencies.sessionId
      || authorization.scope.actorUserId !== auth.guardian.userId
      || authorization.session.ownerUserId !== auth.guardian.userId
      || authorization.session.careSpaceId !== authorization.scope.careSpaceId
      || authorization.session.childId !== authorization.scope.childId
      || authorization.session.authorizationVersion !== authorization.scope.authorizationVersion
      || !authorization.scope.permissions.includes("read")
      || authorization.session.status !== "active"
      || authorization.session.authorizationExpiresAt <= now
      || authorization.scope.expiresAt <= now) throw new SessionStreamError("ACCESS_DENIED");

    const continuation = await verifyContinuationToken(
      headers.continuationToken,
      authorization,
      dependencies.continuationKeys,
      now,
    );
    if (!continuation.ok) throw new SessionStreamError("REQUEST_INVALID");

    const resolved = await dependencies.resolveCursor({
      authorization,
      auth,
      cursor: headers.cursor,
      signal: request.signal,
    });
    if (!resolved.ok) throw new SessionStreamError(resolved.code);
    if (resolved.afterSequence > resolved.lastSequence
      || resolved.firstAvailableSequence < 1
      || (resolved.afterSequence < resolved.firstAvailableSequence - 1 && resolved.lastSequence > 0)) {
      throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
    }

    const initialRaw = await dependencies.readEvents({
      authorization,
      auth,
      afterSequence: resolved.afterSequence,
      limit: DEFAULT_PAGE_SIZE,
      signal: request.signal,
    });
    if (request.signal.aborted) throw new SessionStreamError("CANCELLED");
    const initial = validatePage(initialRaw, dependencies.sessionId, resolved.afterSequence);
    const initialTerminal = initial.find((event) => event.terminal);
    if (initialTerminal && resolved.terminalEventId !== initialTerminal.eventId) {
      throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
    }

    const streamController = new AbortController();
    const callerAbort = () => streamController.abort(new SessionStreamError("CANCELLED"));
    request.signal.addEventListener("abort", callerAbort, { once: true });
    const generator = streamEvents({
      initial,
      afterSequence: resolved.afterSequence,
      terminalAlreadySeen: resolved.terminalEventId !== null && headers.cursor === resolved.terminalEventId,
      authorization,
      auth,
      dependencies,
      ...timing,
      signal: streamController.signal,
      onClose: () => request.signal.removeEventListener("abort", callerAbort),
    });
    const source: AsyncIterable<ChannelEvent> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => generator.next(),
          return: async () => {
            streamController.abort(new SessionStreamError("CANCELLED"));
            return generator.return(undefined);
          },
        };
      },
    };
    const body = createNdjsonStream(source, { signal: streamController.signal });
    return new Response(body, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": NDJSON_CONTENT_TYPE,
        "referrer-policy": "no-referrer",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
        "x-creciendo-channel-version": CRECIENDO_CHANNEL_VERSION,
        "x-creciendo-event-version": CRECIENDO_EVENT_VERSION,
        "x-request-id": auth.requestId,
      },
    });
  } catch (error) {
    return safeErrorResponse(error, auth);
  }
}

function hash(domain: string, values: readonly string[]): string {
  const digest = createHash("sha256");
  digest.update(`${domain}\n`, "utf8");
  for (const value of values) digest.update(`${value.length}:${value}\n`, "utf8");
  return digest.digest("hex");
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

export function createSessionStreamRouteDependencies(config: RuntimeConfig): SessionStreamRouteBaseDependencies {
  const authorizeChild = createAuthorizeChildService(config);
  return Object.freeze({
    continuationKeys: continuationKeys(config),
    async authorizeSession(input): Promise<SessionStreamAuthorization | AccessDenied> {
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
          requiredPermissions: ["read"],
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
    async resolveCursor(input): Promise<StreamCursorResolution> {
      try {
        if (input.signal.aborted) return Object.freeze({ ok: false, code: "ACCESS_DENIED" });
        const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
        const result = await client.rpc("resolve_owned_creciendo_cursor", {
          p_product_session_id: input.authorization.session.productSessionId,
          p_care_space_id: input.authorization.scope.careSpaceId,
          p_child_id: input.authorization.scope.childId,
          p_authorization_version: input.authorization.scope.authorizationVersion,
          p_cursor: input.cursor,
        });
        if (result.error) return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
        if (!Array.isArray(result.data) || result.data.length !== 1) return Object.freeze({ ok: false, code: "ACCESS_DENIED" });
        const parsed = CURSOR_ROW_SCHEMA.safeParse(result.data[0]);
        if (!parsed.success) return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
        if (parsed.data.outcome === "invalid") return Object.freeze({ ok: false, code: "CURSOR_INVALID" });
        if (parsed.data.outcome === "retention_gap") return Object.freeze({ ok: false, code: "RETENTION_GAP" });
        if (parsed.data.after_sequence === null) return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
        return Object.freeze({
          ok: true,
          afterSequence: parsed.data.after_sequence,
          firstAvailableSequence: parsed.data.first_available_sequence,
          lastSequence: parsed.data.last_sequence,
          terminalEventId: parsed.data.terminal_event_id,
        });
      } catch {
        return Object.freeze({ ok: false, code: "PERSISTENCE_UNAVAILABLE" });
      }
    },
    async readEvents(input): Promise<readonly PersistedChannelEvent[]> {
      if (input.signal.aborted) throw new SessionStreamError("CANCELLED");
      const client = createRequestSupabaseClient({ config, accessToken: input.auth.guardian.bearerToken });
      const result = await client.rpc("read_owned_creciendo_events", {
        p_product_session_id: input.authorization.session.productSessionId,
        p_care_space_id: input.authorization.scope.careSpaceId,
        p_child_id: input.authorization.scope.childId,
        p_authorization_version: input.authorization.scope.authorizationVersion,
        p_after_sequence: input.afterSequence,
        p_limit: input.limit,
      });
      if (result.error || !Array.isArray(result.data)) throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
      return Object.freeze(result.data.map((raw) => {
        const parsed = EVENT_ROW_SCHEMA.safeParse(raw);
        if (!parsed.success) throw new SessionStreamError("PERSISTENCE_UNAVAILABLE");
        return Object.freeze({
          eventId: parsed.data.event_id,
          version: parsed.data.version,
          type: parsed.data.type,
          terminal: parsed.data.terminal,
          turnId: parsed.data.turn_id,
          sequence: parsed.data.sequence,
          occurredAt: parsed.data.occurred_at,
          cursor: parsed.data.cursor,
          data: parsed.data.data,
        });
      }));
    },
  });
}
