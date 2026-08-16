import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedGuardian } from "../../agent/lib/access/authenticated-guardian";
import { createAuthorizeChildService } from "../../agent/lib/access/authorize-child-service";

const now = new Date("2026-08-16T12:00:00.000Z");
const guardian: AuthenticatedGuardian = Object.freeze({
  userId: "00000000-0000-4000-8000-000000000001",
  issuedAt: new Date("2026-08-16T11:00:00.000Z"),
  expiresAt: new Date("2026-08-16T12:10:00.000Z"),
  bearerToken: "verified-token" as AuthenticatedGuardian["bearerToken"],
});
const childId = "00000000-0000-4000-8000-000000000002";
const config = { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable-test-key-that-is-long-enough" };

function clientWith(result: unknown) {
  return { rpc: vi.fn().mockResolvedValue(result) } as never;
}

const row = {
  care_space_id: "00000000-0000-4000-8000-000000000003",
  child_id: childId,
  permissions: ["read", "record"],
  country_of_care: "CO" as const,
  timezone: "America/Bogota",
  membership_version: 2,
  access_version: 7,
  membership_valid_until: "2026-08-16T12:04:00.000Z",
  access_valid_until: "2026-08-16T12:03:00.000Z",
};

describe("authorize child service", () => {
  it("uses the verified bearer and returns bounded trusted scope", async () => {
    const fake = clientWith({ data: [row], error: null });
    const service = createAuthorizeChildService(config, { createClient: () => fake });
    const result = await service.authorize({ guardian, requestedChildId: childId, requiredPermissions: ["read"], requestId: "request-1", now });
    expect(result).toMatchObject({ actorUserId: guardian.userId, careSpaceId: row.care_space_id, authorizationVersion: "m:2:a:7", countryOfCare: "CO" });
    expect((fake as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("resolve_authorized_child_scope", { p_child_id: childId, p_required_permissions: ["read"] });
  });

  it.each([
    ["malformed child", "bad", ["read"]],
    ["empty permissions", childId, []],
    ["duplicate permissions", childId, ["read", "read"]],
    ["unknown permissions", childId, ["unknown"]],
  ])("denies %s before RPC", async (_label, requestedChildId, requiredPermissions) => {
    const fake = clientWith({ data: [row], error: null });
    const service = createAuthorizeChildService(config, { createClient: () => fake });
    const result = await service.authorize({ guardian, requestedChildId, requiredPermissions: requiredPermissions as never, requestId: "request-2", now });
    expect(result).toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "request-2" });
    expect((fake as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["RPC error", { data: null, error: new Error("db") }],
    ["zero rows", { data: [], error: null }],
    ["multiple rows", { data: [row, row], error: null }],
    ["projection mismatch", { data: [{ ...row, child_id: "00000000-0000-4000-8000-000000000004" }], error: null }],
    ["bad permissions", { data: [{ ...row, permissions: ["admin"] }], error: null }],
  ])("maps %s to universal denial", async (_label, rpcResult) => {
    const service = createAuthorizeChildService(config, { createClient: () => clientWith(rpcResult) });
    await expect(service.authorize({ guardian, requestedChildId: childId, requiredPermissions: ["read"], requestId: "same-request", now })).resolves.toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "same-request" });
  });

  it("clamps expiry to guardian, membership, access, and five-minute bounds", async () => {
    const service = createAuthorizeChildService(config, { createClient: () => clientWith({ data: [row], error: null }) });
    const result = await service.authorize({ guardian, requestedChildId: childId, requiredPermissions: ["read"], requestId: "expiry-request", now });
    expect(result).toMatchObject({ expiresAt: new Date("2026-08-16T12:03:00.000Z") });
  });

  it("denies an already expired guardian and RPC failure without service-role fallback", async () => {
    const createClient = vi.fn(() => { throw new Error("must not call"); });
    const service = createAuthorizeChildService(config, { createClient });
    const result = await service.authorize({ guardian: { ...guardian, expiresAt: now }, requestedChildId: childId, requiredPermissions: ["read"], requestId: "expired", now });
    expect(result).toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "expired" });
    expect(createClient).not.toHaveBeenCalled();
  });
});
