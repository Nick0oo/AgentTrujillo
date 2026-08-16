import type { RuntimeConfig } from "../config/env";
import type { AuthenticatedGuardian } from "./authenticated-guardian";
import { createAccessDenied, type AccessDenied } from "./access-denied";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
  type ChildPermission,
  type TrustedAuthorizedScopeRow,
} from "./authorized-child-scope";
import { createRequestSupabaseClient, type RequestSupabaseClient } from "../supabase/request-client";

export interface AuthorizeChildService {
  authorize(input: Readonly<{
    guardian: AuthenticatedGuardian;
    requestedChildId: string;
    requiredPermissions: readonly ChildPermission[];
    requestId: string;
    now?: Date;
  }>): Promise<AuthorizedChildScope | AccessDenied>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSIONS = new Set<ChildPermission>(["read", "record", "manage_documents", "manage_medication", "manage_guardians"]);

type ScopeRpcRow = {
  care_space_id: string;
  child_id: string;
  permissions: string[];
  country_of_care: "CO" | "US";
  timezone: string;
  membership_version: number;
  access_version: number;
  membership_valid_until: string | null;
  access_valid_until: string | null;
};

function isValidRequest(input: Readonly<{ requestedChildId: string; requiredPermissions: readonly ChildPermission[] }>): boolean {
  return UUID_PATTERN.test(input.requestedChildId)
    && input.requiredPermissions.length > 0
    && new Set(input.requiredPermissions).size === input.requiredPermissions.length
    && input.requiredPermissions.every((permission) => PERMISSIONS.has(permission));
}

export function createAuthorizeChildService(
  config: Pick<RuntimeConfig, "supabaseUrl" | "supabasePublishableKey">,
  dependencies: Readonly<{ createClient?: (accessToken: AuthenticatedGuardian["bearerToken"]) => RequestSupabaseClient }> = {},
): AuthorizeChildService {
  const createClient = dependencies.createClient ?? ((accessToken) => createRequestSupabaseClient({ config, accessToken }));

  return {
    async authorize(input) {
      if (!isValidRequest(input)) return createAccessDenied(input.requestId);
      const now = input.now ?? new Date();
      if (input.guardian.expiresAt <= now) return createAccessDenied(input.requestId);

      try {
        const client = createClient(input.guardian.bearerToken);
        const result = await client.rpc("resolve_authorized_child_scope", {
          p_child_id: input.requestedChildId,
          p_required_permissions: [...input.requiredPermissions],
        });
        if (result.error || !Array.isArray(result.data) || result.data.length !== 1) {
          return createAccessDenied(input.requestId);
        }
        const row = result.data[0] as ScopeRpcRow;
        if (row.child_id !== input.requestedChildId
          || !UUID_PATTERN.test(row.care_space_id)
          || !Array.isArray(row.permissions)
          || !row.permissions.every((permission) => PERMISSIONS.has(permission as ChildPermission))) {
          return createAccessDenied(input.requestId);
        }
        const membershipExpiry = row.membership_valid_until ? new Date(row.membership_valid_until) : undefined;
        const accessExpiry = row.access_valid_until ? new Date(row.access_valid_until) : undefined;
        const expiresAt = [
          new Date(now.getTime() + 5 * 60 * 1000),
          input.guardian.expiresAt,
          membershipExpiry,
          accessExpiry,
        ].filter((value): value is Date => value !== undefined).reduce((earliest, value) => value < earliest ? value : earliest);
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now || !Number.isInteger(row.membership_version) || !Number.isInteger(row.access_version)) {
          return createAccessDenied(input.requestId);
        }
        const trustedRow: TrustedAuthorizedScopeRow = {
          actorUserId: input.guardian.userId,
          careSpaceId: row.care_space_id,
          childId: row.child_id,
          permissions: row.permissions,
          countryOfCare: row.country_of_care,
          timezone: row.timezone,
          authorizationVersion: `m:${row.membership_version}:a:${row.access_version}`,
          issuedAt: now,
          expiresAt,
        };
        return createAuthorizedChildScopeFromTrustedRow(trustedRow);
      } catch {
        return createAccessDenied(input.requestId);
      }
    },
  };
}
