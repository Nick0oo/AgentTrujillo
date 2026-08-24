import { createHash, randomUUID } from "node:crypto";

import type { HttpRouteDefinition, RouteHandlerArgs } from "eve/channels";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  createSupabaseJwtAuthenticator,
  type SupabaseJwtAuthenticator,
} from "../../../agent/lib/access/supabase-jwt-authenticator";
import type { RuntimeConfig } from "../../../agent/lib/config/env";
import {
  createRequestSupabaseClient,
  type RequestSupabaseClient,
} from "../../../agent/lib/supabase/request-client";

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_AUTHORIZATION_BYTES = 4_096;
const MAX_RATE_BUCKETS = 10_000;
const QUERY_CREDENTIAL_NAMES = new Set(["access_token", "token", "authorization", "apikey", "jwt"]);

export type ChannelRateClass = "command" | "stream";

export type CurrentGuardianProfile = Readonly<{
  locale: "es-CO" | "en-US";
  timeZone: string;
  updatedAt: string;
}>;

export interface GuardianProfileResolver {
  resolveCurrent(guardian: AuthenticatedGuardian, signal: AbortSignal): Promise<CurrentGuardianProfile | null>;
}

export type ChannelRateLimitResult =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

export interface ChannelRateLimiter {
  consume(input: Readonly<{
    key: string;
    rateClass: ChannelRateClass;
    now: Date;
  }>): Promise<ChannelRateLimitResult> | ChannelRateLimitResult;
}

export type CreciendoAuthDependencies = Readonly<{
  authenticator: SupabaseJwtAuthenticator;
  profiles: GuardianProfileResolver;
  rateLimiter: ChannelRateLimiter;
  now?: () => Date;
  generateRequestId?: () => string;
}>;

export type AuthenticatedChannelRequest = Readonly<{
  requestId: string;
  actorKey: string;
  rateClass: ChannelRateClass;
  profile: Readonly<{
    locale: "es-CO" | "en-US";
    timeZone: string;
    versionSha256: string;
  }>;
  guardian: AuthenticatedGuardian;
}>;

export type AuthenticatedChannelHandler = (
  request: Request,
  auth: AuthenticatedChannelRequest,
  args: RouteHandlerArgs,
) => Promise<Response>;

export type ChannelAuthenticationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_UNAVAILABLE"
  | "RATE_LIMITED";

export class ChannelAuthenticationError extends Error {
  constructor(
    readonly status: 401 | 429 | 503,
    readonly code: ChannelAuthenticationErrorCode,
    readonly requestId: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = "ChannelAuthenticationError";
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestId(request: Request, generate: () => string): string {
  const supplied = request.headers.get("x-request-id");
  if (supplied !== null && REQUEST_ID.test(supplied)) return supplied;
  const generated = generate();
  return REQUEST_ID.test(generated) ? generated : randomUUID();
}

function containsQueryCredential(request: Request): boolean {
  try {
    const url = new URL(request.url);
    for (const name of url.searchParams.keys()) {
      if (QUERY_CREDENTIAL_NAMES.has(name.toLowerCase())) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function parseAuthorization(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null
    || header.length > MAX_AUTHORIZATION_BYTES
    || request.headers.has("cookie")
    || containsQueryCredential(request)
    || /[\u0000-\u001f\u007f,]/u.test(header)) return null;
  const matched = /^Bearer ([^\s]+)$/u.exec(header);
  if (!matched || matched[1].split(".").length !== 3) return null;
  return matched[1];
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function validProfile(value: CurrentGuardianProfile | null): value is CurrentGuardianProfile {
  return value !== null
    && (value.locale === "es-CO" || value.locale === "en-US")
    && validTimeZone(value.timeZone)
    && Number.isFinite(Date.parse(value.updatedAt));
}

function rateClass(request: Request): ChannelRateClass {
  try {
    return request.method === "GET" && /^\/creciendo\/v1\/sessions\/[^/]+\/stream$/u.test(new URL(request.url).pathname)
      ? "stream"
      : "command";
  } catch {
    return "command";
  }
}

function authenticatedRequest(
  guardian: AuthenticatedGuardian,
  profile: CurrentGuardianProfile,
  id: string,
  selectedRateClass: ChannelRateClass,
): AuthenticatedChannelRequest {
  const actorKey = hash(`creciendo-rate.v1\n${guardian.userId}\n${guardian.authSessionId ?? "no-session"}`);
  const safeProfile = Object.freeze({
    locale: profile.locale,
    timeZone: profile.timeZone,
    versionSha256: hash(`guardian-profile.v1\n${guardian.userId}\n${profile.updatedAt}`),
  });
  const result = {
    requestId: id,
    actorKey,
    rateClass: selectedRateClass,
    profile: safeProfile,
  } as Omit<AuthenticatedChannelRequest, "guardian"> & { guardian?: AuthenticatedGuardian };
  Object.defineProperty(result, "guardian", {
    value: guardian,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return Object.freeze(result) as AuthenticatedChannelRequest;
}

export async function authenticateCreciendoRequest(
  request: Request,
  dependencies: CreciendoAuthDependencies,
): Promise<AuthenticatedChannelRequest> {
  const generate = dependencies.generateRequestId ?? randomUUID;
  const id = requestId(request, generate);
  const now = dependencies.now?.() ?? new Date();
  const token = parseAuthorization(request);
  if (!token || !Number.isFinite(now.getTime())) {
    throw new ChannelAuthenticationError(401, "AUTHENTICATION_REQUIRED", id);
  }

  let guardian: AuthenticatedGuardian;
  try {
    guardian = await dependencies.authenticator.authenticateAuthorizationHeader(
      request.headers.get("authorization"),
      id,
      now,
    );
  } catch {
    throw new ChannelAuthenticationError(401, "AUTHENTICATION_REQUIRED", id);
  }
  if (!UUID.test(guardian.userId)
    || guardian.bearerToken !== token
    || guardian.issuedAt > now
    || guardian.expiresAt <= now) {
    throw new ChannelAuthenticationError(401, "AUTHENTICATION_REQUIRED", id);
  }

  let profile: CurrentGuardianProfile | null;
  try {
    profile = await dependencies.profiles.resolveCurrent(guardian, request.signal);
  } catch {
    throw new ChannelAuthenticationError(503, "AUTHENTICATION_UNAVAILABLE", id);
  }
  if (!validProfile(profile)) {
    throw new ChannelAuthenticationError(401, "AUTHENTICATION_REQUIRED", id);
  }

  const selectedRateClass = rateClass(request);
  const authenticated = authenticatedRequest(guardian, profile, id, selectedRateClass);
  let limit: ChannelRateLimitResult;
  try {
    limit = await dependencies.rateLimiter.consume({
      key: authenticated.actorKey,
      rateClass: selectedRateClass,
      now,
    });
  } catch {
    throw new ChannelAuthenticationError(503, "AUTHENTICATION_UNAVAILABLE", id);
  }
  if (!limit || typeof limit !== "object" || typeof limit.allowed !== "boolean") {
    throw new ChannelAuthenticationError(503, "AUTHENTICATION_UNAVAILABLE", id);
  }
  if (!limit.allowed) {
    const retry = limit.retryAfterSeconds;
    if (!Number.isInteger(retry) || retry < 1 || retry > 300) {
      throw new ChannelAuthenticationError(503, "AUTHENTICATION_UNAVAILABLE", id);
    }
    throw new ChannelAuthenticationError(429, "RATE_LIMITED", id, retry);
  }
  return authenticated;
}

function failureResponse(error: ChannelAuthenticationError): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-request-id": error.requestId,
  });
  if (error.retryAfterSeconds !== null) headers.set("retry-after", String(error.retryAfterSeconds));
  return new Response(JSON.stringify({ ok: false, code: error.code, requestId: error.requestId }), {
    status: error.status,
    headers,
  });
}

function responseWithRequestId(response: Response, id: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", id);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function withChannelAuth(
  handler: AuthenticatedChannelHandler,
  dependencies: CreciendoAuthDependencies,
): HttpRouteDefinition["handler"] {
  return async (request, args) => {
    let authenticated: AuthenticatedChannelRequest;
    try {
      authenticated = await authenticateCreciendoRequest(request, dependencies);
    } catch (error) {
      if (error instanceof ChannelAuthenticationError) return failureResponse(error);
      const id = requestId(request, dependencies.generateRequestId ?? randomUUID);
      return failureResponse(new ChannelAuthenticationError(503, "AUTHENTICATION_UNAVAILABLE", id));
    }
    return responseWithRequestId(await handler(request, authenticated, args), authenticated.requestId);
  };
}

type LimiterOptions = Readonly<{
  commandLimit?: number;
  streamLimit?: number;
  windowMs?: number;
}>;

export function createInMemoryChannelRateLimiter(options: LimiterOptions = {}): ChannelRateLimiter {
  const commandLimit = options.commandLimit ?? 60;
  const streamLimit = options.streamLimit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  if (![commandLimit, streamLimit, windowMs].every(Number.isInteger)
    || commandLimit < 1 || commandLimit > 10_000
    || streamLimit < 1 || streamLimit > 10_000
    || windowMs < 1_000 || windowMs > 3_600_000) {
    throw new Error("CHANNEL_RATE_LIMIT_CONFIG_INVALID");
  }
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return Object.freeze({
    consume(input: Readonly<{ key: string; rateClass: ChannelRateClass; now: Date }>) {
      const timestamp = input.now.getTime();
      if (!HASH.test(input.key) || !Number.isFinite(timestamp)) {
        return Object.freeze({ allowed: false as const, retryAfterSeconds: 60 });
      }
      const bucketKey = `${input.rateClass}:${input.key}`;
      if (buckets.size >= MAX_RATE_BUCKETS) {
        for (const [key, bucket] of buckets) if (bucket.resetAt <= timestamp) buckets.delete(key);
      }
      if (buckets.size >= MAX_RATE_BUCKETS && !buckets.has(bucketKey)) {
        return Object.freeze({ allowed: false as const, retryAfterSeconds: 60 });
      }
      let bucket = buckets.get(bucketKey);
      if (!bucket || bucket.resetAt <= timestamp) {
        bucket = { count: 0, resetAt: timestamp + windowMs };
        buckets.set(bucketKey, bucket);
      }
      const limit = input.rateClass === "stream" ? streamLimit : commandLimit;
      if (bucket.count >= limit) {
        return Object.freeze({
          allowed: false as const,
          retryAfterSeconds: Math.max(1, Math.min(300, Math.ceil((bucket.resetAt - timestamp) / 1_000))),
        });
      }
      bucket.count += 1;
      return Object.freeze({ allowed: true as const });
    },
  });
}

function createGuardianProfileResolver(
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">,
  createClient: (guardian: AuthenticatedGuardian) => RequestSupabaseClient,
): GuardianProfileResolver {
  return Object.freeze({
    async resolveCurrent(guardian: AuthenticatedGuardian, signal: AbortSignal) {
      if (signal.aborted) throw signal.reason;
      const client = createClient(guardian);
      const current = await client.auth.getUser(guardian.bearerToken);
      if (signal.aborted) throw signal.reason;
      if (current.error) {
        if (current.error.status === 401 || current.error.status === 403) return null;
        throw new Error("AUTH_PROFILE_UNAVAILABLE");
      }
      if (current.data.user?.id !== guardian.userId) return null;
      const profile = await client
        .from("guardian_profiles")
        .select("user_id, locale, time_zone, updated_at")
        .eq("user_id", guardian.userId)
        .abortSignal(signal)
        .maybeSingle();
      if (profile.error) throw new Error("AUTH_PROFILE_UNAVAILABLE");
      if (!profile.data || profile.data.user_id !== guardian.userId) return null;
      if (profile.data.locale !== "es-CO" && profile.data.locale !== "en-US") return null;
      return Object.freeze({
        locale: profile.data.locale,
        timeZone: profile.data.time_zone,
        updatedAt: profile.data.updated_at,
      });
    },
  });
}

export function createCreciendoAuthDependencies(
  config: Pick<RuntimeConfig,
    | "supabaseUrl"
    | "supabasePublishableKey"
    | "supabaseJwtIssuer"
    | "supabaseJwtAudience"
    | "supabaseJwtJwksUrl">,
  options: Readonly<{
    authenticator?: SupabaseJwtAuthenticator;
    createClient?: (guardian: AuthenticatedGuardian) => RequestSupabaseClient;
    rateLimiter?: ChannelRateLimiter;
  }> = {},
): CreciendoAuthDependencies {
  const createClient = options.createClient ?? ((guardian: AuthenticatedGuardian) => createRequestSupabaseClient({
    config,
    accessToken: guardian.bearerToken,
  }));
  return Object.freeze({
    authenticator: options.authenticator ?? createSupabaseJwtAuthenticator(config),
    profiles: createGuardianProfileResolver(config, createClient),
    rateLimiter: options.rateLimiter ?? createInMemoryChannelRateLimiter(),
  });
}
