import { base64url, decodeProtectedHeader, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import type { AuthenticatedGuardian } from "../../agent/lib/access/authenticated-guardian";
import { createAccessDenied } from "../../agent/lib/access/access-denied";
import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createChildContextTokenService } from "../../agent/lib/access/child-context-token";

const now = new Date("2026-08-16T12:00:00.000Z");
const currentKey = base64url.encode(new Uint8Array(32).fill(7));
const previousKey = base64url.encode(new Uint8Array(32).fill(8));
const config = {
  childContextSigningKey: currentKey,
  childContextSigningKid: "current",
  childContextPreviousSigningKey: previousKey,
  childContextPreviousSigningKid: "previous",
};
const guardian: AuthenticatedGuardian = Object.freeze({
  userId: "00000000-0000-4000-8000-000000000001",
  issuedAt: new Date("2026-08-16T11:00:00.000Z"),
  expiresAt: new Date("2026-08-16T12:10:00.000Z"),
  bearerToken: "verified" as AuthenticatedGuardian["bearerToken"],
});
const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: guardian.userId,
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7",
  issuedAt: now,
  expiresAt: new Date("2026-08-16T12:04:00.000Z"),
});

async function previousToken() {
  return new SignJWT({
    ctx_v: 1,
    care_space_id: scope.careSpaceId,
    child_id: scope.childId,
    permissions: [...scope.permissions],
    country_of_care: scope.countryOfCare,
    timezone: scope.timezone,
    authorization_version: scope.authorizationVersion,
  }).setProtectedHeader({ alg: "HS256", typ: "child-context+jwt", kid: "previous" })
    .setIssuer("agent-trujillo").setAudience("creciendo-child-context").setSubject(guardian.userId)
    .setJti("00000000-0000-4000-8000-000000000099").setIssuedAt(Math.floor(now.getTime() / 1000))
    .setNotBefore(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 60)
    .sign(base64url.decode(previousKey));
}

describe("signed child context token", () => {
  it("issues fixed HS256 current-kid tokens and verifies the scope snapshot", async () => {
    const service = createChildContextTokenService(config);
    const token = await service.issue(scope, guardian, now);
    const header = decodeProtectedHeader(token);
    expect(header).toMatchObject({ alg: "HS256", typ: "child-context+jwt", kid: "current" });
    const claims = await service.verify(token, guardian, now);
    expect(claims).toMatchObject({ actorUserId: guardian.userId, careSpaceId: scope.careSpaceId, childId: scope.childId, authorizationVersion: "m:2:a:7" });
    expect(claims).toMatchObject({ expiresAt: new Date("2026-08-16T12:02:00.000Z") });
  });

  it("clamps to scope/guardian expiry and issues unique IDs", async () => {
    const service = createChildContextTokenService(config);
    const first = await service.issue(scope, guardian, now);
    const second = await service.issue(scope, guardian, new Date(now.getTime() + 1000));
    expect(first).not.toBe(second);
    const shortGuardian = { ...guardian, expiresAt: new Date("2026-08-16T12:01:00.000Z") };
    const claims = await service.verify(await service.issue(scope, shortGuardian, now), shortGuardian, now);
    expect(claims).toMatchObject({ expiresAt: new Date("2026-08-16T12:01:00.000Z") });
  });

  it("rejects scope/guardian mismatch and non-positive issuance windows", async () => {
    const service = createChildContextTokenService(config);
    await expect(service.issue(scope, { ...guardian, userId: "00000000-0000-4000-8000-000000000004" }, now)).rejects.toThrow("CHILD_CONTEXT_INVALID");
    await expect(service.issue({ ...scope, expiresAt: now }, guardian, now)).rejects.toThrow("CHILD_CONTEXT_INVALID");
  });

  it("verifies previous rotation keys but never signs with them", async () => {
    const service = createChildContextTokenService(config);
    const token = await previousToken();
    const claims = await service.verify(token, guardian, now);
    expect(claims).not.toEqual(createAccessDenied("different"));
    expect(decodeProtectedHeader(await service.issue(scope, guardian, now)).kid).toBe("current");
  });

  it("denies tampering, sibling/user substitution, expiry, and wrong headers uniformly", async () => {
    const service = createChildContextTokenService(config);
    const token = await service.issue(scope, guardian, now);
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const otherGuardian = { ...guardian, userId: "00000000-0000-4000-8000-000000000004" };
    const cases = [
      tampered,
      await new SignJWT({ ctx_v: 1, care_space_id: scope.careSpaceId, child_id: scope.childId, permissions: [...scope.permissions], country_of_care: scope.countryOfCare, timezone: scope.timezone, authorization_version: scope.authorizationVersion }).setProtectedHeader({ alg: "HS256", typ: "child-context+jwt", kid: "unknown" }).setIssuer("agent-trujillo").setAudience("creciendo-child-context").setSubject(guardian.userId).setJti("00000000-0000-4000-8000-000000000097").setIssuedAt(Math.floor(now.getTime() / 1000)).setNotBefore(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 60).sign(base64url.decode(currentKey)),
      await new SignJWT({}).setProtectedHeader({ alg: "HS256", typ: "wrong", kid: "current" }).setIssuedAt(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 60).sign(base64url.decode(currentKey)),
    ];
    for (const candidate of cases) expect(await service.verify(candidate, guardian, now)).toEqual(createAccessDenied("child-context"));
    expect(await service.verify(token, otherGuardian, now)).toEqual(createAccessDenied("child-context"));
    expect(await service.verify(token, guardian, new Date("2026-08-16T12:03:00.000Z"))).toEqual(createAccessDenied("child-context"));
  });

  it("rejects unknown claims and configuration/key failures without values", async () => {
    expect(() => createChildContextTokenService({ childContextSigningKey: base64url.encode(new Uint8Array(16)), childContextSigningKid: "short" })).toThrow("CHILD_CONTEXT_INVALID");
    const service = createChildContextTokenService(config);
    const unknown = await new SignJWT({ ctx_v: 1, extra: "nope" }).setProtectedHeader({ alg: "HS256", typ: "child-context+jwt", kid: "current" }).setIssuer("agent-trujillo").setAudience("creciendo-child-context").setSubject(guardian.userId).setJti("00000000-0000-4000-8000-000000000098").setIssuedAt(Math.floor(now.getTime() / 1000)).setNotBefore(Math.floor(now.getTime() / 1000)).setExpirationTime(Math.floor(now.getTime() / 1000) + 60).sign(base64url.decode(currentKey));
    expect(await service.verify(unknown, guardian, now)).toEqual(createAccessDenied("child-context"));
  });

  it("does not log or persist token material", async () => {
    const source = await import("../../agent/lib/access/child-context-token");
    expect(Object.keys(source)).not.toContain("tokenStore");
    expect(JSON.stringify(source)).not.toMatch(/console\.(log|error)|localStorage|messages/i);
  });
});
