import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedGuardian } from "../../../agent/lib/access/authenticated-guardian";
import {
  authenticateCreciendoRequest,
  createInMemoryChannelRateLimiter,
  withChannelAuth,
  type CreciendoAuthDependencies,
} from "../../../src/channels/creciendo/auth-middleware";
import { withProductionChannelAuth } from "../../../agent/channels/creciendo";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "20000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-24T12:00:00.000Z");
const TOKEN = "header.payload.signature";

function guardian(userId = USER_ID, token = TOKEN): AuthenticatedGuardian {
  return Object.freeze({
    userId,
    issuedAt: new Date(NOW.getTime() - 1_000),
    expiresAt: new Date(NOW.getTime() + 60_000),
    authSessionId: `auth-${userId}`,
    bearerToken: token as never,
  });
}

function dependencies(overrides: Partial<CreciendoAuthDependencies> = {}): CreciendoAuthDependencies {
  return {
    authenticator: {
      authenticateAuthorizationHeader: vi.fn(async (header) => {
        if (header !== `Bearer ${TOKEN}`) throw new Error("AUTHENTICATION_FAILED");
        return guardian();
      }),
    },
    profiles: {
      resolveCurrent: vi.fn(async () => ({
        locale: "es-CO" as const,
        timeZone: "America/Bogota",
        updatedAt: "2026-08-24T11:59:00.000Z",
      })),
    },
    rateLimiter: { consume: vi.fn(async () => ({ allowed: true as const })) },
    now: () => new Date(NOW),
    generateRequestId: () => "generated-request-id",
    ...overrides,
  };
}

function request(path = "/creciendo/v1/sessions", init: RequestInit = {}): Request {
  return new Request(`https://agent.test${path}`, {
    method: path.endsWith("/stream") ? "GET" : "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "x-request-id": "request-01", ...init.headers },
    ...init,
  });
}

describe("Creciendo authentication middleware", () => {
  it("authenticates one bearer, resolves the current profile and emits only opaque safe metadata", async () => {
    const deps = dependencies();
    const authenticated = await authenticateCreciendoRequest(request(), deps);

    expect(authenticated.requestId).toBe("request-01");
    expect(authenticated.rateClass).toBe("command");
    expect(authenticated.actorKey).toMatch(/^[a-f0-9]{64}$/u);
    expect(authenticated.profile).toEqual({
      locale: "es-CO",
      timeZone: "America/Bogota",
      versionSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(authenticated.guardian).toEqual(guardian());
    expect(JSON.stringify(authenticated)).not.toContain(USER_ID);
    expect(JSON.stringify(authenticated)).not.toContain(TOKEN);
    expect(Object.keys(authenticated)).not.toContain("guardian");
    expect(deps.profiles.resolveCurrent).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), expect.any(AbortSignal));
    expect(deps.rateLimiter.consume).toHaveBeenCalledWith(expect.objectContaining({
      key: authenticated.actorKey,
      rateClass: "command",
      now: NOW,
    }));
  });

  it("classifies stream connects separately and never derives rate keys from path session IDs", async () => {
    const deps = dependencies();
    const first = await authenticateCreciendoRequest(request("/creciendo/v1/sessions/guessed-a/stream"), deps);
    const second = await authenticateCreciendoRequest(request("/creciendo/v1/sessions/guessed-b/stream"), deps);
    expect(first.rateClass).toBe("stream");
    expect(first.actorKey).toBe(second.actorKey);
  });

  it("rejects missing, duplicate, malformed, query and cookie credentials before profile access", async () => {
    const profiles = { resolveCurrent: vi.fn() };
    const deps = dependencies({ profiles });
    const cases = [
      new Request("https://agent.test/creciendo/v1/sessions", { method: "POST" }),
      request(undefined, { headers: { authorization: `Bearer ${TOKEN}, Bearer ${TOKEN}` } }),
      request(undefined, { headers: { authorization: "Basic credential" } }),
      request("/creciendo/v1/sessions?access_token=forged"),
      request(undefined, { headers: { authorization: `Bearer ${TOKEN}`, cookie: "session=forged" } }),
    ];
    for (const candidate of cases) {
      await expect(authenticateCreciendoRequest(candidate, deps)).rejects.toMatchObject({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
      });
    }
    expect(profiles.resolveCurrent).not.toHaveBeenCalled();
  });

  it("treats a missing/revoked profile uniformly and dependency outage as unavailable", async () => {
    await expect(authenticateCreciendoRequest(request(), dependencies({
      profiles: { resolveCurrent: vi.fn(async () => null) },
    }))).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED", status: 401 });

    await expect(authenticateCreciendoRequest(request(), dependencies({
      profiles: { resolveCurrent: vi.fn(async () => { throw new Error("database details"); }) },
    }))).rejects.toMatchObject({ code: "AUTHENTICATION_UNAVAILABLE", status: 503 });
  });

  it("returns a safe rate-limit failure with a bounded retry delay", async () => {
    await expect(authenticateCreciendoRequest(request(), dependencies({
      rateLimiter: { consume: vi.fn(async () => ({ allowed: false as const, retryAfterSeconds: 12 })) },
    }))).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429, retryAfterSeconds: 12 });
  });

  it("wraps handlers with uniform no-store failures and never leaks causes or credentials", async () => {
    const successful = vi.fn(async (_request, auth) => Response.json({ actorKey: auth.actorKey }));
    const wrapped = withChannelAuth(successful, dependencies());
    const response = await wrapped(request(), {} as never);
    expect(response.status).toBe(200);
    expect(successful).toHaveBeenCalledOnce();

    const missing = await wrapped(new Request("https://agent.test/creciendo/v1/sessions", { method: "POST" }), {} as never);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.json()).toEqual({ ok: false, code: "AUTHENTICATION_REQUIRED", requestId: "generated-request-id" });

    const outage = withChannelAuth(successful, dependencies({
      authenticator: { authenticateAuthorizationHeader: vi.fn(async () => { throw new Error(`secret ${TOKEN}`); }) },
    }));
    const failed = await outage(request(), {} as never);
    expect(failed.status).toBe(401);
    expect(await failed.text()).not.toContain(TOKEN);

    const routeFailure = withChannelAuth(async () => { throw new Error("route_failure"); }, dependencies());
    await expect(routeFailure(request(), {} as never)).rejects.toThrowError("route_failure");
  });

  it("isolates concurrent principals and bounds the in-memory defensive limiter", async () => {
    const auth = vi.fn(async (header: string | null) => header?.endsWith(".two")
      ? guardian(OTHER_USER_ID, "header.payload.two")
      : guardian());
    const deps = dependencies({ authenticator: { authenticateAuthorizationHeader: auth } });
    const [first, second] = await Promise.all([
      authenticateCreciendoRequest(request(), deps),
      authenticateCreciendoRequest(request(undefined, { headers: { authorization: "Bearer header.payload.two" } }), deps),
    ]);
    expect(first.actorKey).not.toBe(second.actorKey);

    const limiter = createInMemoryChannelRateLimiter({ commandLimit: 2, streamLimit: 1, windowMs: 60_000 });
    expect(await limiter.consume({ key: "a".repeat(64), rateClass: "command", now: NOW })).toEqual({ allowed: true });
    expect(await limiter.consume({ key: "a".repeat(64), rateClass: "command", now: NOW })).toEqual({ allowed: true });
    expect(await limiter.consume({ key: "a".repeat(64), rateClass: "command", now: NOW })).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("normalizes invalid correlation IDs without reflecting attacker content", async () => {
    const authenticated = await authenticateCreciendoRequest(request(undefined, {
      headers: { authorization: `Bearer ${TOKEN}`, "x-request-id": "bad,identifier" },
    }), dependencies());
    expect(authenticated.requestId).toBe("generated-request-id");
  });

  it("composes authentication ahead of every production handler when runtime config is valid", async () => {
    const names = ["APP_ENV", "GOOGLE_GENERATIVE_AI_API_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    Object.assign(process.env, {
      APP_ENV: "test",
      GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-google-key-000000000000000",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key-000000000",
    });
    try {
      const downstream = vi.fn(async () => Response.json({ ok: true }));
      const guarded = withProductionChannelAuth(downstream);
      const response = await guarded(new Request("https://agent.test/creciendo/v1/sessions", { method: "POST" }), {} as never);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, code: "AUTHENTICATION_REQUIRED" });
      expect(downstream).not.toHaveBeenCalled();

      const routeFailure = withProductionChannelAuth(async () => { throw new Error("route_failure"); });
      await expect(routeFailure(request(), {} as never)).resolves.toMatchObject({ status: 401 });
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
