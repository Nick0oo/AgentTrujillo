import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from "jose";
import { describe, expect, it } from "vitest";

import { AuthenticationError } from "../../agent/lib/access/authenticated-guardian";
import { createSupabaseJwtAuthenticator } from "../../agent/lib/access/supabase-jwt-authenticator";

const requestId = "req-auth-fixture";
const userId = "00000000-0000-4000-8000-000000000001";
const issuer = "https://example.supabase.co/auth/v1";
const baseConfig = {
  supabaseJwtIssuer: issuer,
  supabaseJwtAudience: "authenticated" as const,
  supabaseJwtJwksUrl: `${issuer}/.well-known/jwks.json`,
};
const now = new Date("2026-08-16T12:00:00.000Z");

async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "fixture-es256";
  const keySet = createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256", use: "sig", kid: "fixture-es256" }] });
  const sign = (overrides: Record<string, unknown> = {}) => {
    let builder = new SignJWT({ role: "authenticated", ...overrides })
      .setProtectedHeader({ alg: "ES256", kid: "fixture-es256", typ: "JWT" });
    if (!("iss" in overrides)) builder = builder.setIssuer(issuer);
    if (!("aud" in overrides)) builder = builder.setAudience("authenticated");
    if (!("sub" in overrides)) builder = builder.setSubject(userId);
    if (!("iat" in overrides)) builder = builder.setIssuedAt(Math.floor(now.getTime() / 1000));
    if (!("exp" in overrides)) builder = builder.setExpirationTime(Math.floor(now.getTime() / 1000) + 300);
    return builder.sign(privateKey);
  };
  return { keySet, sign };
}

async function authenticate(token: string, keySet: Parameters<typeof createSupabaseJwtAuthenticator>[1] extends never ? never : ReturnType<typeof createLocalJWKSet>) {
  return createSupabaseJwtAuthenticator(baseConfig, { keySet }).authenticateAuthorizationHeader(`Bearer ${token}`, requestId, now);
}

describe("Supabase JWT authenticator", () => {
  it("accepts a valid ES256 token and projects only guardian identity", async () => {
    const { keySet, sign } = await fixture();
    const guardian = await authenticate(await sign({ user_metadata: { child_id: "foreign" }, app_metadata: { role: "owner" } }), keySet);
    expect(guardian.userId).toBe(userId);
    expect(guardian.bearerToken.split(".")).toHaveLength(3);
    expect(guardian).not.toHaveProperty("user_metadata");
  });

  it("rejects missing, duplicate, malformed, oversized, and control-character headers uniformly", async () => {
    const { keySet } = await fixture();
    const auth = createSupabaseJwtAuthenticator(baseConfig, { keySet });
    for (const header of [null, "", "Bearer a, Bearer b", "Basic token", `Bearer ${"a".repeat(5000)}`, "Bearer a\nBearer b"]) {
      await expect(auth.authenticateAuthorizationHeader(header, requestId, now)).rejects.toMatchObject({ failure: { code: "AUTHENTICATION_FAILED", requestId } });
    }
  });

  it.each([
    ["wrong issuer", { iss: "https://wrong.example/auth/v1" }],
    ["wrong audience", { aud: "other" }],
    ["wrong role", { role: "service_role" }],
    ["wrong subject", { sub: "not-a-uuid" }],
    ["future iat", { iat: Math.floor(now.getTime() / 1000) + 60 }],
    ["expired", { exp: Math.floor(now.getTime() / 1000) - 1 }],
    ["future nbf", { nbf: Math.floor(now.getTime() / 1000) + 60 }],
  ])("rejects %s claims", async (_label, overrides) => {
    const { keySet, sign } = await fixture();
    const token = await sign(overrides);
    await expect(authenticate(token, keySet)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("rejects HS256, none, bad signatures, missing claims, and old tokens", async () => {
    const { keySet, sign } = await fixture();
    await expect(authenticate(await sign({}), keySet)).resolves.toBeTruthy();
    const malformed = createSupabaseJwtAuthenticator(baseConfig, { keySet });
    for (const token of ["x.y.z", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0."]) {
      await expect(malformed.authenticateAuthorizationHeader(`Bearer ${token}`, requestId, now)).rejects.toBeInstanceOf(AuthenticationError);
    }
    const old = await new SignJWT({ role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid: "fixture-es256" }).setIssuer(issuer).setAudience("authenticated").setSubject(userId).setIssuedAt(Math.floor(now.getTime() / 1000) - 7200).setExpirationTime(Math.floor(now.getTime() / 1000) + 300).sign((await generateKeyPair("ES256")).privateKey);
    await expect(authenticate(old, keySet)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("accepts a small clock skew but rejects a token beyond it", async () => {
    const { keySet, sign } = await fixture();
    const skewedNow = new Date(now.getTime() + 4000);
    await expect(createSupabaseJwtAuthenticator(baseConfig, { keySet }).authenticateAuthorizationHeader(`Bearer ${await sign()}`, requestId, skewedNow)).resolves.toBeTruthy();
    const tooEarly = new Date(now.getTime() - 10_000);
    await expect(createSupabaseJwtAuthenticator(baseConfig, { keySet }).authenticateAuthorizationHeader(`Bearer ${await sign({ nbf: Math.floor(now.getTime() / 1000) })}`, requestId, tooEarly)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("requires a project-matching HTTPS JWKS URL", async () => {
    const { keySet } = await fixture();
    expect(() => createSupabaseJwtAuthenticator({ ...baseConfig, supabaseJwtJwksUrl: "https://wrong.example/jwks.json" }, { keySet })).toThrow();
    expect(() => createSupabaseJwtAuthenticator({ ...baseConfig, supabaseJwtJwksUrl: "http://example.supabase.co/auth/v1/.well-known/jwks.json" }, { keySet })).toThrow();
  });

  it("keeps failure details redacted and supports concurrent principals", async () => {
    const { keySet, sign } = await fixture();
    const auth = createSupabaseJwtAuthenticator(baseConfig, { keySet });
    const [first, second] = await Promise.all([auth.authenticateAuthorizationHeader(`Bearer ${await sign()}`, "r1", now), auth.authenticateAuthorizationHeader(`Bearer ${await sign({ sub: "00000000-0000-4000-8000-000000000002" })}`, "r2", now)]);
    expect(first.userId).not.toBe(second.userId);
    await expect(auth.authenticateAuthorizationHeader("Bearer x.y.z", "private-request-id", now)).rejects.toMatchObject({ message: "AUTHENTICATION_FAILED", failure: { requestId: "private-request-id" } });
  });
});
