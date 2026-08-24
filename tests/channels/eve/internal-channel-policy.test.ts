import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeAuth } from "eve/channels/auth";
import { describe, expect, it } from "vitest";

import {
  INTERNAL_EVE_AUTH,
  createInternalEveAuth,
  resolveInternalChannelPolicy,
} from "../../../agent/channels/eve";

const EVE_ROUTES = Object.freeze([
  Object.freeze({ method: "GET", path: "/eve/v1/info" }),
  Object.freeze({ method: "POST", path: "/eve/v1/session" }),
  Object.freeze({ method: "POST", path: "/eve/v1/session/reset" }),
  Object.freeze({ method: "POST", path: "/eve/v1/session/guessed-session-id" }),
  Object.freeze({ method: "GET", path: "/eve/v1/session/guessed-session-id/stream" }),
  Object.freeze({ method: "POST", path: "/eve/v1/session/guessed-session-id/cancel" }),
]);

async function authorize(
  environment: Readonly<Record<string, string | undefined>>,
  route: Readonly<{ method: string; path: string }>,
  authorization?: string,
) {
  return routeAuth(new Request(`https://agent.example${route.path}`, {
    method: route.method,
    headers: authorization ? { authorization } : undefined,
  }), createInternalEveAuth(environment));
}

async function expectGenericDenial(result: Awaited<ReturnType<typeof authorize>>) {
  expect(result).toBeInstanceOf(Response);
  if (!(result instanceof Response)) throw new Error("EXPECTED_DENIAL");
  expect(result.status).toBe(403);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({ code: "forbidden", error: "Forbidden.", ok: false });
}

describe("internal Eve channel policy", () => {
  it.each(["production", "preview"])("disables every Eve route in %s before session lookup", async (appEnv) => {
    for (const route of EVE_ROUTES) {
      await expectGenericDenial(await authorize({ APP_ENV: appEnv }, route));
    }
  });

  it("does not recognize a guardian bearer or guessed session id as operator authority", async () => {
    const route = EVE_ROUTES[4];
    const anonymous = await authorize({ APP_ENV: "production" }, route);
    const guardian = await authorize({ APP_ENV: "production" }, route, "Bearer synthetic.supabase.guardian");
    await expectGenericDenial(anonymous);
    await expectGenericDenial(guardian);
  });

  it("fails closed for missing, unknown, or attempted operator-mode configuration", async () => {
    const cases = [
      {},
      { APP_ENV: "staging" },
      { APP_ENV: "production", EVE_INTERNAL_CHANNEL_MODE: "operator-oidc" },
      { APP_ENV: "production", EVE_INTERNAL_CHANNEL_MODE: "local" },
      { APP_ENV: "development", VERCEL_ENV: "production", EVE_INTERNAL_CHANNEL_MODE: "local" },
      { APP_ENV: "test", VERCEL_ENV: "preview" },
    ];

    for (const environment of cases) {
      expect(resolveInternalChannelPolicy(environment).mode).toBe("disabled");
      await expectGenericDenial(await authorize(environment, EVE_ROUTES[0], "Bearer revoked-operator"));
    }
  });

  it("permits only loopback requests in development or test", async () => {
    for (const appEnv of ["development", "test"]) {
      expect(resolveInternalChannelPolicy({ APP_ENV: appEnv })).toEqual({
        appEnv,
        mode: "local-loopback",
      });
      const accepted = await routeAuth(
        new Request("http://127.0.0.1:3000/eve/v1/info"),
        createInternalEveAuth({ APP_ENV: appEnv }),
      );
      expect(accepted).not.toBeInstanceOf(Response);
      if (accepted instanceof Response) throw new Error("EXPECTED_LOCAL_AUTH");
      expect(accepted).toMatchObject({
        authenticator: "local-dev",
        principalId: "local-dev",
        principalType: "local-dev",
      });

      await expectGenericDenial(await authorize({ APP_ENV: appEnv }, EVE_ROUTES[0]));
    }
  });

  it("keeps the filesystem-discovered channel wired to the same fail-closed auth array", async () => {
    expect(Object.isFrozen(INTERNAL_EVE_AUTH)).toBe(true);
    const result = await routeAuth(
      new Request("https://agent.example/eve/v1/session/guessed-session-id/stream", {
        headers: { authorization: "Bearer synthetic.guardian.jwt" },
      }),
      INTERNAL_EVE_AUTH,
    );
    await expectGenericDenial(result);

    const source = readFileSync(resolve(process.cwd(), "agent/channels/eve.ts"), "utf8");
    expect(source).toContain("eveChannel({");
    expect(source).toContain("auth: INTERNAL_EVE_AUTH");
    expect(source).not.toMatch(/placeholderAuth|vercelOidc|none\s*\(/u);
  });
});
