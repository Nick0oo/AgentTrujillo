import { base64url, decodeJwt, decodeProtectedHeader, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope";
import type { OwnedSessionRecord } from "../../../agent/lib/access/session-record";
import {
  createContinuationTokenKeyRing,
  issueContinuationToken,
  rotateContinuationToken,
  verifyContinuationToken,
} from "../../../src/channels/creciendo/continuation-token";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const CURRENT_SECRET = base64url.encode(new Uint8Array(32).fill(11));
const PREVIOUS_SECRET = base64url.encode(new Uint8Array(32).fill(12));
const USER_ID = "10000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "20000000-0000-4000-8000-000000000002";
const CHILD_ID = "30000000-0000-4000-8000-000000000003";
const SESSION_ID = "40000000-0000-4000-8000-000000000004";

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: USER_ID,
  careSpaceId: CARE_SPACE_ID,
  childId: CHILD_ID,
  permissions: ["read", "record"],
  countryOfCare: "CO",
  timezone: "America/Bogota",
  authorizationVersion: "m:2:a:7",
  issuedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 300_000),
});

const session: OwnedSessionRecord = Object.freeze({
  productSessionId: SESSION_ID,
  eveSessionId: "eve-internal-01",
  ownerUserId: scope.actorUserId,
  careSpaceId: scope.careSpaceId,
  childId: scope.childId,
  authorizationVersion: scope.authorizationVersion,
  authorizationExpiresAt: new Date(NOW.getTime() + 240_000),
  status: "active",
  lastSequence: 12,
});

const ring = createContinuationTokenKeyRing({
  current: { kid: "continuation-current", secret: CURRENT_SECRET },
  previous: { kid: "continuation-previous", secret: PREVIOUS_SECRET },
});

describe("Creciendo continuation token policy", () => {
  it("issues a short fixed-policy token containing only opaque authorization bindings", async () => {
    const token = await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, NOW);
    expect(token.length).toBeLessThanOrEqual(4_096);
    expect(decodeProtectedHeader(token)).toEqual({ alg: "HS256", typ: "creciendo-continuation+jwt", kid: "continuation-current" });
    const payload = decodeJwt(token);
    expect(payload).toMatchObject({ ctv: 1, iss: "agent-trujillo", aud: "creciendo-session-continuation", seq: 7 });
    expect(payload).toMatchObject({ sb: expect.stringMatching(/^[a-f0-9]{64}$/u), ab: expect.stringMatching(/^[a-f0-9]{64}$/u), sv: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(JSON.stringify(payload)).not.toMatch(new RegExp([USER_ID, CARE_SPACE_ID, CHILD_ID, SESSION_ID, "m:2:a:7", "permission", "timezone"].join("|"), "iu"));

    const verified = await verifyContinuationToken(token, { scope, session }, ring, NOW);
    expect(verified).toMatchObject({ ok: true, claims: { lastSequence: 7, version: 1 } });
    if (verified.ok) expect(Object.values(verified.claims).join(" ")).not.toContain(SESSION_ID);
  });

  it("denies tamper, wrong session/actor/space/child/security version and oversized input uniformly", async () => {
    const token = await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, NOW);
    const tampered = `${token.slice(0, -2)}aa`;
    const otherScope = createAuthorizedChildScopeFromTrustedRow({
      ...scope,
      actorUserId: "50000000-0000-4000-8000-000000000005",
    });
    const cases = [
      [tampered, { scope, session }],
      [token, { scope, session: { ...session, productSessionId: "60000000-0000-4000-8000-000000000006" } }],
      [token, { scope: otherScope, session: { ...session, ownerUserId: otherScope.actorUserId } }],
      [token, { scope: { ...scope, authorizationVersion: "m:3:a:7" }, session: { ...session, authorizationVersion: "m:3:a:7" } }],
      [`${"x".repeat(4_097)}`, { scope, session }],
    ] as const;
    for (const [candidate, expected] of cases) {
      expect(await verifyContinuationToken(candidate as never, expected as never, ring, NOW)).toEqual({ ok: false, code: "CONTINUATION_INVALID" });
    }
  });

  it("enforces expiry, not-before, audience, type, algorithm and key id", async () => {
    const token = await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, NOW);
    expect(await verifyContinuationToken(token, { scope, session }, ring, new Date(NOW.getTime() + 136_000))).toEqual({ ok: false, code: "CONTINUATION_INVALID" });
    const future = await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, new Date(NOW.getTime() + 30_000));
    expect(await verifyContinuationToken(future, { scope, session }, ring, NOW)).toEqual({ ok: false, code: "CONTINUATION_INVALID" });

    const key = base64url.decode(CURRENT_SECRET);
    const base = new SignJWT({ ctv: 1, sb: "a".repeat(64), ab: "b".repeat(64), sv: "c".repeat(64), seq: 0 })
      .setIssuer("agent-trujillo").setAudience("wrong").setJti(crypto.randomUUID())
      .setIssuedAt(Math.floor(NOW.getTime() / 1_000)).setNotBefore(Math.floor(NOW.getTime() / 1_000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1_000) + 60);
    const invalid = [
      await base.setProtectedHeader({ alg: "HS512", typ: "creciendo-continuation+jwt", kid: "continuation-current" }).sign(key),
      await base.setProtectedHeader({ alg: "HS256", typ: "wrong", kid: "continuation-current" }).sign(key),
      await base.setProtectedHeader({ alg: "HS256", typ: "creciendo-continuation+jwt", kid: "unknown" }).sign(key),
    ];
    for (const candidate of invalid) expect(await verifyContinuationToken(candidate as never, { scope, session }, ring, NOW)).toEqual({ ok: false, code: "CONTINUATION_INVALID" });
  });

  it("verifies the previous rotation key but always issues with the current key", async () => {
    const previousIssuer = createContinuationTokenKeyRing({ current: { kid: "continuation-previous", secret: PREVIOUS_SECRET } });
    const previousToken = await issueContinuationToken({ scope, session, lastSequence: 7 }, previousIssuer, NOW);
    expect(await verifyContinuationToken(previousToken, { scope, session }, ring, NOW)).toMatchObject({ ok: true });
    expect(decodeProtectedHeader(await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, NOW)).kid).toBe("continuation-current");
  });

  it("allows effect-free verification replay and rotates only monotonically without reusing token IDs", async () => {
    const token = await issueContinuationToken({ scope, session, lastSequence: 7 }, ring, NOW);
    expect(await verifyContinuationToken(token, { scope, session }, ring, NOW)).toMatchObject({ ok: true });
    expect(await verifyContinuationToken(token, { scope, session }, ring, NOW)).toMatchObject({ ok: true });
    expect(await rotateContinuationToken(token, { scope, session, lastSequence: 6 }, ring, NOW)).toEqual({ ok: false, code: "CONTINUATION_INVALID" });
    const first = await rotateContinuationToken(token, { scope, session, lastSequence: 12 }, ring, NOW);
    const second = await rotateContinuationToken(token, { scope, session, lastSequence: 12 }, ring, NOW);
    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    if (first.ok && second.ok) expect(first.token).not.toBe(second.token);
  });

  it("rejects weak/duplicate key rings without reflecting key material", () => {
    expect(() => createContinuationTokenKeyRing({ current: { kid: "current", secret: "short" } })).toThrowError("CONTINUATION_KEY_INVALID");
    expect(() => createContinuationTokenKeyRing({ current: { kid: "same", secret: CURRENT_SECRET }, previous: { kid: "same", secret: PREVIOUS_SECRET } })).toThrowError("CONTINUATION_KEY_INVALID");
  });
});
