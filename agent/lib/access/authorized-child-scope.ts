import { z } from "zod";

import { createAccessDenied, type AccessDenied } from "./access-denied";

declare const actorUserIdBrand: unique symbol;
declare const careSpaceIdBrand: unique symbol;
declare const childIdBrand: unique symbol;

export type ActorUserId = string & { readonly [actorUserIdBrand]: true };
export type CareSpaceId = string & { readonly [careSpaceIdBrand]: true };
export type ChildId = string & { readonly [childIdBrand]: true };
export type ChildPermission = "read" | "record" | "manage_documents" | "manage_medication" | "manage_guardians";
export type ChildCountry = "CO" | "US";

export type TrustedAuthorizedScopeRow = Readonly<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly string[];
  countryOfCare: string;
  timezone: string;
  authorizationVersion: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type AuthorizedChildScope = Readonly<{
  actorUserId: ActorUserId;
  careSpaceId: CareSpaceId;
  childId: ChildId;
  permissions: readonly ChildPermission[];
  countryOfCare: ChildCountry;
  timezone: string;
  authorizationVersion: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

const uuid = z.string().uuid();
const permission = z.enum(["read", "record", "manage_documents", "manage_medication", "manage_guardians"]);
const rowSchema = z.object({
  actorUserId: uuid,
  careSpaceId: uuid,
  childId: uuid,
  permissions: z.array(z.string()).min(1),
  countryOfCare: z.enum(["CO", "US"]),
  timezone: z.string().min(1).refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }),
  authorizationVersion: z.string().regex(/^m:[1-9][0-9]*:a:[1-9][0-9]*$/),
  issuedAt: z.date(),
  expiresAt: z.date(),
}).superRefine((row, context) => {
  if (row.expiresAt <= row.issuedAt) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "expiry" });
  }
  if (row.expiresAt.getTime() - row.issuedAt.getTime() > 5 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "ttl" });
  }
  if (row.permissions.some((value) => !permission.safeParse(value).success)) {
    context.addIssue({ code: "custom", path: ["permissions"], message: "permission" });
  }
});

function freezeDate(value: Date): Date {
  return Object.freeze(new Date(value.getTime()));
}

export function createAuthorizedChildScopeFromTrustedRow(row: TrustedAuthorizedScopeRow): AuthorizedChildScope {
  const parsed = rowSchema.parse(row);
  const permissions = Object.freeze(
    [...new Set(parsed.permissions as ChildPermission[])].sort(),
  );
  return Object.freeze({
    actorUserId: parsed.actorUserId as ActorUserId,
    careSpaceId: parsed.careSpaceId as CareSpaceId,
    childId: parsed.childId as ChildId,
    permissions,
    countryOfCare: parsed.countryOfCare,
    timezone: parsed.timezone,
    authorizationVersion: parsed.authorizationVersion,
    issuedAt: freezeDate(parsed.issuedAt),
    expiresAt: freezeDate(parsed.expiresAt),
  });
}

export function isAuthorizedChildScopeActive(scope: AuthorizedChildScope, now = new Date()): boolean {
  return now >= scope.issuedAt && now < scope.expiresAt;
}

export function hasPermission(scope: AuthorizedChildScope, required: ChildPermission, now = new Date()): boolean {
  return isAuthorizedChildScopeActive(scope, now) && scope.permissions.includes(required);
}

export function requirePermission(
  scope: AuthorizedChildScope,
  required: ChildPermission,
  requestId: string,
  now = new Date(),
): AuthorizedChildScope | AccessDenied {
  return hasPermission(scope, required, now) ? scope : createAccessDenied(requestId);
}

export function sameAuthorizedChildScope(left: AuthorizedChildScope, right: AuthorizedChildScope): boolean {
  return left.actorUserId === right.actorUserId
    && left.careSpaceId === right.careSpaceId
    && left.childId === right.childId
    && left.authorizationVersion === right.authorizationVersion;
}
