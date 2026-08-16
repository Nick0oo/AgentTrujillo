import type { RuntimeConfig } from "../config/env";
import type { RequestSupabaseClient } from "../supabase/request-client";
import type { AccessDenied } from "./access-denied";
import { createAccessDenied } from "./access-denied";
import type { AuthorizedChildScope } from "./authorized-child-scope";
import type { CreateSessionInput, OwnedSessionRecord } from "./session-record";

export interface SessionOwnershipRepository {
  create(scope: AuthorizedChildScope, input: CreateSessionInput, requestId?: string): Promise<OwnedSessionRecord | AccessDenied>;
  bindEveSession(scope: AuthorizedChildScope, productSessionId: string, eveSessionId: string, requestId?: string): Promise<OwnedSessionRecord | AccessDenied>;
  findByProductId(scope: AuthorizedChildScope, id: string, requestId?: string): Promise<OwnedSessionRecord | AccessDenied>;
  findByEveSessionId(scope: AuthorizedChildScope, id: string, requestId?: string): Promise<OwnedSessionRecord | AccessDenied>;
  refreshLease(scope: AuthorizedChildScope, productSessionId: string, requestId?: string): Promise<OwnedSessionRecord | AccessDenied>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_STATUS = new Set(["active", "completed", "cancelled", "archived"]);

type SessionProjection = {
  id?: string;
  product_session_id?: string;
  eve_session_id: string | null;
  owner_user_id: string;
  care_space_id: string;
  child_id: string;
  authorization_version: string;
  authorization_expires_at: string;
  status: string;
  last_sequence: number;
};

function recordFrom(scope: AuthorizedChildScope, row: SessionProjection): OwnedSessionRecord | null {
  const productSessionId = row.id ?? row.product_session_id;
  const expires = new Date(row.authorization_expires_at);
  if (!productSessionId || !UUID_PATTERN.test(productSessionId)
    || row.owner_user_id !== scope.actorUserId
    || row.care_space_id !== scope.careSpaceId
    || row.child_id !== scope.childId
    || row.authorization_version !== scope.authorizationVersion
    || !SESSION_STATUS.has(row.status)
    || !Number.isSafeInteger(row.last_sequence)
    || !Number.isFinite(expires.getTime())) return null;
  return Object.freeze({
    productSessionId,
    eveSessionId: row.eve_session_id,
    ownerUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: row.authorization_version,
    authorizationExpiresAt: Object.freeze(expires),
    status: row.status as OwnedSessionRecord["status"],
    lastSequence: row.last_sequence,
  });
}

function oneRow(result: { data: unknown; error: unknown }, scope: AuthorizedChildScope, requestId: string): OwnedSessionRecord | AccessDenied {
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) return createAccessDenied(requestId);
  const record = recordFrom(scope, result.data[0] as SessionProjection);
  return record ?? createAccessDenied(requestId);
}

export function createSessionOwnershipRepository(
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">,
  dependencies: Readonly<{ createClient?: (scope: AuthorizedChildScope) => RequestSupabaseClient }> = {},
): SessionOwnershipRepository {
  const clientFor = dependencies.createClient ?? ((scope) => {
    throw new Error("request client dependency missing");
  });
  return {
    async create(scope, input, requestId = "session") {
      try {
        const client = clientFor(scope);
        return oneRow(await client.rpc("create_owned_agent_session", {
          p_care_space_id: scope.careSpaceId,
          p_child_id: scope.childId,
          p_authorization_version: scope.authorizationVersion,
          p_authorization_expires_at: scope.expiresAt.toISOString(),
          p_channel: input.channel,
          p_initial_model: input.initialModel,
          p_initial_configuration: input.initialConfiguration ?? {},
        }), scope, requestId);
      } catch {
        return createAccessDenied(requestId);
      }
    },
    async bindEveSession(scope, productSessionId, eveSessionId, requestId = "session") {
      if (!UUID_PATTERN.test(productSessionId) || !eveSessionId || eveSessionId.length > 200) return createAccessDenied(requestId);
      try {
        const client = clientFor(scope);
        return oneRow(await client.rpc("bind_owned_eve_session", {
          p_product_session_id: productSessionId,
          p_care_space_id: scope.careSpaceId,
          p_child_id: scope.childId,
          p_authorization_version: scope.authorizationVersion,
          p_eve_session_id: eveSessionId,
        }), scope, requestId);
      } catch {
        return createAccessDenied(requestId);
      }
    },
    async findByProductId(scope, id, requestId = "session") {
      if (!UUID_PATTERN.test(id)) return createAccessDenied(requestId);
      return find(scope, requestId, (query) => query.eq("id", id));
    },
    async findByEveSessionId(scope, id, requestId = "session") {
      if (!id || id.length > 200) return createAccessDenied(requestId);
      return find(scope, requestId, (query) => query.eq("eve_session_id", id));
    },
    async refreshLease(scope, productSessionId, requestId = "session") {
      if (!UUID_PATTERN.test(productSessionId)) return createAccessDenied(requestId);
      try {
        const client = clientFor(scope);
        return oneRow(await client.rpc("refresh_owned_agent_session_lease", {
          p_product_session_id: productSessionId,
          p_care_space_id: scope.careSpaceId,
          p_child_id: scope.childId,
          p_authorization_version: scope.authorizationVersion,
          p_authorization_expires_at: scope.expiresAt.toISOString(),
        }), scope, requestId);
      } catch {
        return createAccessDenied(requestId);
      }
    },
  };

  async function find(scope: AuthorizedChildScope, requestId: string, filter: (query: any) => any): Promise<OwnedSessionRecord | AccessDenied> {
    try {
      const client = clientFor(scope);
      const result = await filter(client.from("agent_sessions").select("id, eve_session_id, owner_user_id, care_space_id, child_id, authorization_version, authorization_expires_at, status, last_sequence")
        .eq("owner_user_id", scope.actorUserId)
        .eq("care_space_id", scope.careSpaceId)
        .eq("child_id", scope.childId)
        .eq("authorization_version", scope.authorizationVersion)).maybeSingle();
      if (result.error || !result.data) return createAccessDenied(requestId);
      const record = recordFrom(scope, result.data as SessionProjection);
      return record ?? createAccessDenied(requestId);
    } catch {
      return createAccessDenied(requestId);
    }
  }
}
