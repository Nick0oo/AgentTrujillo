import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope";
import { createSessionOwnershipRepository } from "../../agent/lib/access/session-ownership-repository";

const now = new Date("2026-08-16T12:00:00.000Z");
const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["read", "record"], countryOfCare: "CO", timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7", issuedAt: now, expiresAt: new Date("2026-08-16T12:04:00.000Z"),
});
const row = { id: "00000000-0000-4000-8000-000000000004", eve_session_id: null, owner_user_id: scope.actorUserId, care_space_id: scope.careSpaceId, child_id: scope.childId, authorization_version: scope.authorizationVersion, authorization_expires_at: "2026-08-16T12:03:00.000Z", status: "active", last_sequence: 0 };
const config = { supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable-test-key-that-is-long-enough" };

function fakeClient(rpcResult: unknown = { data: [row], error: null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const query = { eq: vi.fn().mockReturnThis(), maybeSingle };
  const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) });
  return { rpc, from, query } as never;
}

describe("session ownership repository", () => {
  it("creates and binds only from the authorized scope", async () => {
    const client = fakeClient();
    const repository = createSessionOwnershipRepository(config, { createClient: () => client });
    const created = await repository.create(scope, { channel: "evaluation", initialModel: "fixture" }, "create-request");
    expect(created).toMatchObject({ productSessionId: row.id, ownerUserId: scope.actorUserId, authorizationVersion: scope.authorizationVersion });
    await repository.bindEveSession(scope, row.id, "eve-fixture", "bind-request");
    expect((client as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith("bind_owned_eve_session", expect.objectContaining({ p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_authorization_version: scope.authorizationVersion }));
  });

  it("finds by product/Eve ID with all scope predicates", async () => {
    const client = fakeClient();
    const repository = createSessionOwnershipRepository(config, { createClient: () => client });
    await repository.findByProductId(scope, row.id, "find-product");
    await repository.findByEveSessionId(scope, "eve-fixture", "find-eve");
    const query = (client as { query: { eq: ReturnType<typeof vi.fn> } }).query;
    expect(query.eq).toHaveBeenCalledWith("owner_user_id", scope.actorUserId);
    expect(query.eq).toHaveBeenCalledWith("care_space_id", scope.careSpaceId);
    expect(query.eq).toHaveBeenCalledWith("child_id", scope.childId);
    expect(query.eq).toHaveBeenCalledWith("authorization_version", scope.authorizationVersion);
  });

  it.each([
    ["RPC error", { data: null, error: new Error("db") }],
    ["zero rows", { data: [], error: null }],
    ["multiple rows", { data: [row, row], error: null }],
    ["wrong owner", { data: [{ ...row, owner_user_id: "00000000-0000-4000-8000-000000000099" }], error: null }],
    ["wrong version", { data: [{ ...row, authorization_version: "m:3:a:1" }], error: null }],
  ])("maps %s to universal denial", async (_label, result) => {
    const repository = createSessionOwnershipRepository(config, { createClient: () => fakeClient(result) });
    await expect(repository.create(scope, { channel: "evaluation", initialModel: "fixture" }, "same-request")).resolves.toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "same-request" });
  });

  it("denies malformed identifiers before client calls and never falls back to service role", async () => {
    const createClient = vi.fn(() => fakeClient());
    const repository = createSessionOwnershipRepository(config, { createClient });
    await expect(repository.findByProductId(scope, "bad", "bad-product")).resolves.toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "bad-product" });
    await expect(repository.bindEveSession(scope, "bad", "eve", "bad-bind")).resolves.toEqual({ ok: false, code: "ACCESS_DENIED", requestId: "bad-bind" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("keeps the record projection minimal and terminal statuses typed", async () => {
    const client = fakeClient();
    const repository = createSessionOwnershipRepository(config, { createClient: () => client });
    const result = await repository.findByProductId(scope, row.id);
    expect(result).not.toHaveProperty("initialConfiguration");
    expect(Object.isFrozen(result)).toBe(true);
    const terminal = await createSessionOwnershipRepository(config, { createClient: () => fakeClient({ data: [{ ...row, status: "cancelled", last_sequence: 2 }], error: null }) }).create(scope, { channel: "evaluation", initialModel: "fixture" });
    expect(terminal).toMatchObject({ status: "cancelled", lastSequence: 2 });
  });
});
