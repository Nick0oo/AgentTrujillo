import type { AuthenticatedGuardian } from "./authenticated-guardian";
import { createAccessDenied, type AccessDenied } from "./access-denied";
import type { AuthorizeChildService } from "./authorize-child-service";
import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
  type ChildPermission,
} from "./authorized-child-scope";
import type { SessionOwnershipRepository } from "./session-ownership-repository";
import type { OwnedSessionRecord } from "./session-record";

export type SessionOperation = "create" | "follow_up" | "stream" | "cancel" | "resume" | "inspect";

const OPERATION_PERMISSIONS: Readonly<Record<SessionOperation, ChildPermission>> = Object.freeze({
  create: "record",
  follow_up: "record",
  stream: "read",
  cancel: "read",
  resume: "record",
  inspect: "read",
});

const ACTIVE_ONLY = new Set<SessionOperation>(["follow_up", "stream", "cancel", "resume"]);

export type LeaseValidationInput = Readonly<{
  guardian: AuthenticatedGuardian;
  signedScope: AuthorizedChildScope;
  operation: SessionOperation;
  session?: OwnedSessionRecord;
  requestId: string;
  now?: Date;
}>;

export interface AccessLeaseValidator {
  validateForOperation(input: LeaseValidationInput): Promise<AuthorizedChildScope | AccessDenied>;
}

function sameSessionScope(session: OwnedSessionRecord, scope: AuthorizedChildScope): boolean {
  return session.ownerUserId === scope.actorUserId
    && session.careSpaceId === scope.careSpaceId
    && session.childId === scope.childId
    && session.authorizationVersion === scope.authorizationVersion;
}

function sameSessionRecord(left: OwnedSessionRecord, right: OwnedSessionRecord): boolean {
  return left.productSessionId === right.productSessionId
    && left.eveSessionId === right.eveSessionId
    && left.ownerUserId === right.ownerUserId
    && left.careSpaceId === right.careSpaceId
    && left.childId === right.childId
    && left.authorizationVersion === right.authorizationVersion
    && left.authorizationExpiresAt.getTime() === right.authorizationExpiresAt.getTime()
    && left.status === right.status
    && left.lastSequence === right.lastSequence;
}

export function requiredPermissionForOperation(operation: SessionOperation): ChildPermission {
  return OPERATION_PERMISSIONS[operation];
}

export function createAccessLeaseValidator(dependencies: Readonly<{
  authorizeChild: AuthorizeChildService;
  sessions: SessionOwnershipRepository;
}>): AccessLeaseValidator {
  return {
    async validateForOperation(input) {
      const deny = () => createAccessDenied(input.requestId);
      const now = input.now ?? new Date();
      const requiredPermission = OPERATION_PERMISSIONS[input.operation];
      if (!requiredPermission
        || input.guardian.userId !== input.signedScope.actorUserId
        || input.guardian.expiresAt <= now
        || !hasPermission(input.signedScope, requiredPermission, now)
        || (input.operation === "create" && input.session !== undefined)
        || (input.operation !== "create" && input.session === undefined)) return deny();

      try {
        const freshScope = await dependencies.authorizeChild.authorize({
          guardian: input.guardian,
          requestedChildId: input.signedScope.childId,
          requiredPermissions: [requiredPermission],
          requestId: input.requestId,
          now,
        });
        if ("ok" in freshScope) return freshScope;
        if (!sameAuthorizedChildScope(input.signedScope, freshScope)
          || !freshScope.permissions.every((permission) => input.signedScope.permissions.includes(permission))
          || !hasPermission(freshScope, requiredPermission, now)
          || freshScope.expiresAt <= now) return deny();

        if (!input.session) return freshScope;
        const stored = await dependencies.sessions.refreshLease(input.signedScope, input.session.productSessionId, input.requestId);
        if ("ok" in stored
          || !sameSessionRecord(stored, input.session)
          || stored.productSessionId !== input.session.productSessionId
          || !sameSessionScope(stored, freshScope)
          || stored.authorizationExpiresAt <= now
          || stored.authorizationExpiresAt > freshScope.expiresAt
          || (ACTIVE_ONLY.has(input.operation) && stored.status !== "active")) return deny();
        return freshScope;
      } catch {
        return deny();
      }
    },
  };
}
