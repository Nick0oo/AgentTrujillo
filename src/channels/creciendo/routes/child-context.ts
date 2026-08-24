import { createHash } from "node:crypto";

import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import { CHILD_CONTEXT_TTL_SECONDS } from "../../../../agent/lib/access/child-context-claims";
import type { AuthorizedChildScope } from "../../../../agent/lib/access/authorized-child-scope";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import { createRequestSupabaseClient } from "../../../../agent/lib/supabase/request-client";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  CHILD_CONTEXT_REQUEST_SCHEMA,
  CHILD_CONTEXT_RESPONSE_SCHEMA,
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_ERROR_VERSION,
  negotiateClientCapabilities,
} from "../types";

const HASH = /^[a-f0-9]{64}$/u;
const MAX_NONCES = 10_000;

export interface ChildSummaryResolver {
  resolve(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, signal: AbortSignal): Promise<Readonly<{
    reference: string;
    displayName: string;
  }> | null>;
}

export interface ChildContextNonceStore {
  consume(input: Readonly<{
    actorKey: string;
    nonce: string;
    expiresAt: Date;
    now: Date;
  }>): boolean;
}

export type ChildContextRouteDependencies = Readonly<{
  authorizeChild: AuthorizeChildService;
  tokens: ChildContextTokenService;
  childSummary: ChildSummaryResolver;
  nonces: ChildContextNonceStore;
  now?: () => Date;
}>;

type ErrorCode = "ACCESS_DENIED" | "REQUEST_INVALID" | "VERSION_UNSUPPORTED" | "CONFLICT" | "PERSISTENCE_UNAVAILABLE";

function safeError(status: number, code: ErrorCode): Response {
  return Response.json({
    version: CRECIENDO_ERROR_VERSION,
    code,
    retryable: code === "PERSISTENCE_UNAVAILABLE",
    retryAfterSeconds: null,
    effectState: "none",
    resumable: false,
  }, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function nonceKey(actorKey: string, nonce: string): string {
  return createHash("sha256").update(`child-context-nonce.v1\n${actorKey}\n${nonce}`, "utf8").digest("hex");
}

export function createInMemoryChildContextNonceStore(
  options: Readonly<{ maxEntries?: number }> = {},
): ChildContextNonceStore {
  const maxEntries = options.maxEntries ?? MAX_NONCES;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_NONCES) {
    throw new Error("CHILD_CONTEXT_NONCE_CONFIG_INVALID");
  }
  const entries = new Map<string, number>();
  const store: ChildContextNonceStore = {
    consume(input) {
      const now = input.now.getTime();
      const expiry = input.expiresAt.getTime();
      if (!HASH.test(input.actorKey) || !Number.isFinite(now) || !Number.isFinite(expiry) || expiry <= now) return false;
      const key = nonceKey(input.actorKey, input.nonce);
      const existing = entries.get(key);
      if (existing !== undefined && existing > now) return false;
      if (entries.size >= maxEntries) {
        for (const [storedKey, storedExpiry] of entries) if (storedExpiry <= now) entries.delete(storedKey);
      }
      if (entries.size >= maxEntries && !entries.has(key)) return false;
      entries.set(key, expiry);
      return true;
    },
  };
  return Object.freeze(store);
}

function tokenExpiresAt(scope: AuthorizedChildScope, auth: AuthenticatedChannelRequest, now: Date): Date {
  return new Date(Math.min(
    now.getTime() + CHILD_CONTEXT_TTL_SECONDS * 1_000,
    scope.expiresAt.getTime(),
    auth.guardian.expiresAt.getTime(),
  ));
}

export async function handleChildContext(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: ChildContextRouteDependencies,
): Promise<Response> {
  const now = dependencies.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime()) || request.signal.aborted) return safeError(503, "PERSISTENCE_UNAVAILABLE");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return safeError(400, "REQUEST_INVALID");
  }
  const parsed = CHILD_CONTEXT_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return safeError(400, "REQUEST_INVALID");
  const negotiated = negotiateClientCapabilities(parsed.data.capabilities);
  if (!negotiated) return safeError(400, "VERSION_UNSUPPORTED");

  const provisionalExpiry = new Date(Math.min(
    now.getTime() + CHILD_CONTEXT_TTL_SECONDS * 1_000,
    auth.guardian.expiresAt.getTime(),
  ));
  if (!dependencies.nonces.consume({
    actorKey: auth.actorKey,
    nonce: parsed.data.nonce,
    expiresAt: provisionalExpiry,
    now,
  })) return safeError(409, "CONFLICT");

  const scope = await dependencies.authorizeChild.authorize({
    guardian: auth.guardian,
    requestedChildId: parsed.data.childId,
    requiredPermissions: ["read"],
    requestId: auth.requestId,
    now,
  });
  if ("ok" in scope) return safeError(404, "ACCESS_DENIED");

  try {
    const child = await dependencies.childSummary.resolve(scope, auth, request.signal);
    if (!child) return safeError(503, "PERSISTENCE_UNAVAILABLE");
    const childContextToken = await dependencies.tokens.issue(scope, auth.guardian, now);
    const response = CHILD_CONTEXT_RESPONSE_SCHEMA.parse({
      version: CRECIENDO_CHANNEL_VERSION,
      requestId: auth.requestId,
      childContextToken,
      expiresAt: tokenExpiresAt(scope, auth, now).toISOString(),
      scopeVersion: "authorized-child-scope.v1",
      child,
      capabilities: negotiated,
    });
    return Response.json(response, {
      status: 200,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch {
    return safeError(503, "PERSISTENCE_UNAVAILABLE");
  }
}

function safeDisplayName(value: string | null | undefined): string | null {
  const normalized = value?.trim().normalize("NFKC");
  return normalized && normalized.length <= 160 && !/[\u0000-\u001f\u007f\p{Cf}\p{Cs}]/u.test(normalized)
    ? normalized
    : null;
}

function createChildSummaryResolver(config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">): ChildSummaryResolver {
  const resolver: ChildSummaryResolver = {
    async resolve(scope, auth, signal) {
      if (signal.aborted) return null;
      const client = createRequestSupabaseClient({ config, accessToken: auth.guardian.bearerToken });
      const result = await client
        .from("children")
        .select("id, care_space_id, preferred_name, given_names, status")
        .eq("id", scope.childId)
        .eq("care_space_id", scope.careSpaceId)
        .eq("status", "active")
        .abortSignal(signal)
        .maybeSingle();
      if (result.error || !result.data || result.data.id !== scope.childId || result.data.care_space_id !== scope.careSpaceId) return null;
      const displayName = safeDisplayName(result.data.preferred_name) ?? safeDisplayName(result.data.given_names);
      return displayName ? Object.freeze({ reference: scope.childId, displayName }) : null;
    },
  };
  return Object.freeze(resolver);
}

export function createChildContextRouteDependencies(config: RuntimeConfig): ChildContextRouteDependencies {
  return Object.freeze({
    authorizeChild: createAuthorizeChildService(config),
    tokens: createChildContextTokenService(config),
    childSummary: createChildSummaryResolver(config),
    nonces: createInMemoryChildContextNonceStore(),
  });
}
