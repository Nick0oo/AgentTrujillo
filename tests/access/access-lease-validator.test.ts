import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedGuardian } from "../../agent/lib/access/authenticated-guardian";
import { createAccessDenied } from "../../agent/lib/access/access-denied";
import { createAccessLeaseValidator } from "../../agent/lib/access/access-lease-validator";
import type { AuthorizeChildService } from "../../agent/lib/access/authorize-child-service";
import { createAuthorizedChildScopeFromTrustedRow, type AuthorizedChildScope } from "../../agent/lib/access/authorized-child-scope";
import type { SessionOwnershipRepository } from "../../agent/lib/access/session-ownership-repository";
import type { OwnedSessionRecord } from "../../agent/lib/access/session-record";
import type { SupabaseBearerToken } from "../../agent/lib/supabase/types";

const now = new Date("2026-08-16T12:00:00.000Z");
const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "00000000-0000-4000-8000-000000000001", careSpaceId: "00000000-0000-4000-8000-000000000002", childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read", "record"], countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:2:a:7",
  issuedAt: new Date("2026-08-16T11:59:00.000Z"), expiresAt: new Date("2026-08-16T12:04:00.000Z"),
});
const guardian: AuthenticatedGuardian = Object.freeze({ userId: scope.actorUserId, issuedAt: new Date("2026-08-16T11:59:00.000Z"), expiresAt: new Date("2026-08-16T12:30:00.000Z"), bearerToken: "jwt.fixture" as SupabaseBearerToken });
const session: OwnedSessionRecord = Object.freeze({ productSessionId: "00000000-0000-4000-8000-000000000004", eveSessionId: "eve-1", ownerUserId: scope.actorUserId, careSpaceId: scope.careSpaceId, childId: scope.childId, authorizationVersion: scope.authorizationVersion, authorizationExpiresAt: new Date("2026-08-16T12:03:00.000Z"), status: "active", lastSequence: 0 });

function make(overrides: Readonly<Record<string, unknown>> = {}, repoResult: OwnedSessionRecord | ReturnType<typeof createAccessDenied> = session) {
  const fresh = createAuthorizedChildScopeFromTrustedRow({
    actorUserId: (overrides.actorUserId as string | undefined) ?? scope.actorUserId,
    careSpaceId: (overrides.careSpaceId as string | undefined) ?? scope.careSpaceId,
    childId: (overrides.childId as string | undefined) ?? scope.childId,
    permissions: (overrides.permissions as readonly string[] | undefined) ?? scope.permissions,
    countryOfCare: scope.countryOfCare,
    timezone: scope.timezone,
    authorizationVersion: (overrides.authorizationVersion as string | undefined) ?? scope.authorizationVersion,
    issuedAt: scope.issuedAt,
    expiresAt: scope.expiresAt,
  });
  const authorizeChild: AuthorizeChildService = { authorize: vi.fn().mockResolvedValue(fresh) };
  const sessions = { refreshLease: vi.fn().mockResolvedValue(repoResult) } as unknown as SessionOwnershipRepository;
  return { validator: createAccessLeaseValidator({ authorizeChild, sessions }), authorizeChild, sessions, fresh };
}

describe("access lease validator", () => {
  it.each(["create", "follow_up", "stream", "cancel", "resume", "inspect"] as const)("freshly validates %s", async (operation) => {
    const { validator, authorizeChild } = make();
    const result = await validator.validateForOperation({ guardian, signedScope: scope, operation, ...(operation === "create" ? {} : { session }), requestId: "lease-1", now });
    expect(result).toMatchObject({ childId: scope.childId, authorizationVersion: scope.authorizationVersion });
    expect(authorizeChild.authorize).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong actor", { actorUserId: "00000000-0000-4000-8000-000000000099" }],
    ["wrong space", { careSpaceId: "00000000-0000-4000-8000-000000000099" }],
    ["wrong child", { childId: "00000000-0000-4000-8000-000000000099" }],
    ["stale version", { authorizationVersion: "m:3:a:7" }],
  ])("denies %s fresh scope", async (_label, overrides) => {
    const { validator } = make(overrides);
    await expect(validator.validateForOperation({ guardian, signedScope: scope, operation: "stream", session, requestId: "lease-2", now })).resolves.toEqual(createAccessDenied("lease-2"));
  });

  it("denies missing/widened operation permission and expired leases", async () => {
    const noRecord = make({ permissions: ["read"] });
    await expect(noRecord.validator.validateForOperation({ guardian, signedScope: noRecord.fresh, operation: "create", requestId: "lease-3", now })).resolves.toEqual(createAccessDenied("lease-3"));
    const widened = make({ permissions: ["read", "record", "manage_guardians"] });
    await expect(widened.validator.validateForOperation({ guardian, signedScope: scope, operation: "stream", session, requestId: "lease-4", now })).resolves.toEqual(createAccessDenied("lease-4"));
    const expired = { ...session, authorizationExpiresAt: new Date("2026-08-16T11:59:59.000Z") };
    await expect(make({}, expired).validator.validateForOperation({ guardian, signedScope: scope, operation: "stream", session: expired, requestId: "lease-5", now })).resolves.toEqual(createAccessDenied("lease-5"));
  });

  it("denies terminal active-only operations but permits inspect", async () => {
    const terminal = { ...session, status: "cancelled" as const };
    const { validator } = make({}, terminal);
    await expect(validator.validateForOperation({ guardian, signedScope: scope, operation: "follow_up", session: terminal, requestId: "lease-6", now })).resolves.toEqual(createAccessDenied("lease-6"));
    await expect(validator.validateForOperation({ guardian, signedScope: scope, operation: "inspect", session: terminal, requestId: "lease-7", now })).resolves.toMatchObject({ childId: scope.childId });
  });

  it("fails closed on authorization/repository errors and never widens the token", async () => {
    const { validator } = make({}, createAccessDenied("db"));
    await expect(validator.validateForOperation({ guardian, signedScope: scope, operation: "stream", session, requestId: "lease-8", now })).resolves.toEqual(createAccessDenied("lease-8"));
    const authorizeChild: AuthorizeChildService = { authorize: vi.fn().mockRejectedValue(new Error("network")) };
    const sessions = { refreshLease: vi.fn() } as unknown as SessionOwnershipRepository;
    const failing = createAccessLeaseValidator({ authorizeChild, sessions });
    await expect(failing.validateForOperation({ guardian, signedScope: scope, operation: "stream", session, requestId: "lease-9", now })).resolves.toEqual(createAccessDenied("lease-9"));
  });
});
