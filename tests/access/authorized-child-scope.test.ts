import { describe, expect, it } from "vitest";

import { createAccessDenied } from "../../agent/lib/access/access-denied";
import {
  createAuthorizedChildScopeFromTrustedRow,
  hasPermission,
  isAuthorizedChildScopeActive,
  requirePermission,
  sameAuthorizedChildScope,
} from "../../agent/lib/access/authorized-child-scope";

const issuedAt = new Date("2026-08-16T12:00:00.000Z");
const expiresAt = new Date("2026-08-16T12:05:00.000Z");
const base = {
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["manage_documents", "read", "read"] as const,
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7",
  issuedAt,
  expiresAt,
};

describe("authorized child scope", () => {
  it("normalizes permissions and freezes the scope", () => {
    const scope = createAuthorizedChildScopeFromTrustedRow(base);
    expect(scope.permissions).toEqual(["manage_documents", "read"]);
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(scope.permissions)).toBe(true);
  });

  it.each(["read", "record", "manage_documents", "manage_medication", "manage_guardians"] as const)("supports %s permission", (required) => {
    const scope = createAuthorizedChildScopeFromTrustedRow({ ...base, permissions: [required] });
    expect(hasPermission(scope, required, new Date("2026-08-16T12:01:00.000Z"))).toBe(true);
  });

  it.each([
    ["bad UUID", { actorUserId: "not-uuid" }],
    ["bad permission", { permissions: ["admin"] }],
    ["bad country", { countryOfCare: "MX" }],
    ["bad timezone", { timezone: "Mars/Olympus" }],
    ["bad version", { authorizationVersion: "v1" }],
    ["expired range", { issuedAt: expiresAt, expiresAt: issuedAt }],
    ["long TTL", { expiresAt: new Date("2026-08-16T12:06:00.000Z") }],
  ])("rejects %s trusted rows", (_label, overrides) => {
    expect(() => createAuthorizedChildScopeFromTrustedRow({ ...base, ...overrides } as never)).toThrow();
  });

  it("requires a positive, finite five-minute window", () => {
    const scope = createAuthorizedChildScopeFromTrustedRow(base);
    expect(isAuthorizedChildScopeActive(scope, issuedAt)).toBe(true);
    expect(isAuthorizedChildScopeActive(scope, expiresAt)).toBe(false);
    expect(hasPermission(scope, "read", expiresAt)).toBe(false);
  });

  it("returns the same scope for an allowed permission and universal denial otherwise", () => {
    const scope = createAuthorizedChildScopeFromTrustedRow(base);
    const allowed = requirePermission(scope, "read", "request-1", new Date("2026-08-16T12:01:00.000Z"));
    expect(allowed).toBe(scope);
    const denied = requirePermission(scope, "record", "request-1", new Date("2026-08-16T12:01:00.000Z"));
    expect(denied).toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "request-1" });
  });

  it("maps expired and malformed request IDs without denial reasons", () => {
    const scope = createAuthorizedChildScopeFromTrustedRow(base);
    expect(requirePermission(scope, "read", "bad id with spaces", expiresAt)).toEqual(createAccessDenied("bad id with spaces"));
    expect(JSON.stringify(requirePermission(scope, "read", "bad id with spaces", expiresAt))).not.toMatch(/expired|permission|reason/i);
  });

  it("compares actor, space, child, and authorization version only", () => {
    const scope = createAuthorizedChildScopeFromTrustedRow(base);
    expect(sameAuthorizedChildScope(scope, createAuthorizedChildScopeFromTrustedRow(base))).toBe(true);
    expect(sameAuthorizedChildScope(scope, createAuthorizedChildScopeFromTrustedRow({ ...base, childId: "00000000-0000-4000-8000-000000000004" }))).toBe(false);
    expect(sameAuthorizedChildScope(scope, createAuthorizedChildScopeFromTrustedRow({ ...base, authorizationVersion: "m:3:a:7" }))).toBe(false);
  });

  it("does not expose model/tool imports or clinical data", async () => {
    const source = await import("../../agent/lib/access/authorized-child-scope");
    expect(Object.keys(source)).not.toContain("parseModelInput");
    expect(JSON.stringify(createAuthorizedChildScopeFromTrustedRow(base))).not.toMatch(/given_names|diagnosis|metadata/i);
  });
});
