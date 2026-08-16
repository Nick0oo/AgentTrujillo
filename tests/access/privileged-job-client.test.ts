import { describe, expect, it } from "vitest";

import type { RuntimeConfig } from "../../agent/lib/config/env";
import {
  PrivilegedJobError,
  withPrivilegedJobClient,
} from "../../agent/lib/supabase/privileged-job-client";
import type { PrivilegedJobScope } from "../../agent/lib/supabase/privileged-job-scope";

const now = new Date("2026-08-16T12:00:00.000Z");
const config: RuntimeConfig = Object.freeze({
  appEnv: "test",
  googleApiKey: "synthetic-provider-key-0123456789",
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "sb_publishable-test-key-that-is-long-enough",
  supabaseServiceRoleKey: "service-role-test-key-that-is-long-enough",
  supabaseJwtIssuer: "https://example.supabase.co/auth/v1",
  supabaseJwtAudience: "authenticated",
  supabaseJwtJwksUrl: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
});

function scope(overrides: Partial<PrivilegedJobScope> = {}): PrivilegedJobScope {
  return {
    jobName: "fixture-job",
    invocationId: "fixture-invocation",
    careSpaceId: "00000000-0000-4000-8000-000000000001",
    childId: "00000000-0000-4000-8000-000000000002",
    allowedOperations: ["workflow:summary"],
    issuedAt: new Date(now.getTime() - 60_000),
    expiresAt: new Date(now.getTime() + 60_000),
    ...overrides,
  } as PrivilegedJobScope;
}

function response(): Response {
  return new Response(JSON.stringify({ data: [], error: null }), {
    status: 200,
    headers: { "content-type": "application/json", "content-range": "0-0/*" },
  });
}

describe("privileged Supabase job boundary", () => {
  it("constructs service-role access only inside a scoped callback", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response();
    };

    const result = await withPrivilegedJobClient(
      { config, scope: scope(), operation: "workflow:summary", now, fetch },
      async (client, receivedScope) => {
        expect(receivedScope.jobName).toBe("fixture-job");
        await client.from("children").select("id").limit(1);
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(requests[0].headers.get("authorization")).toBe(`Bearer ${config.supabaseServiceRoleKey}`);
    expect(requests[0].headers.get("apikey")).toBe(config.supabaseServiceRoleKey);
  });

  it.each([
    ["missing service key", { config: { ...config, supabaseServiceRoleKey: undefined } }],
    ["expired", { scope: scope({ expiresAt: new Date(now.getTime()) }) }],
    ["too long", { scope: scope({ expiresAt: new Date(now.getTime() + 15 * 60_000 + 1) }) }],
    ["child without space", { scope: scope({ careSpaceId: undefined }) }],
    ["operation mismatch", { operation: "maintenance:retention" as const }],
  ])("rejects %s before network construction", async (_label, overrides) => {
    const fetch = async () => response();
    await expect(withPrivilegedJobClient(
      { config, scope: scope(), operation: "workflow:summary", now, fetch, ...overrides },
      async () => "unreachable",
    )).rejects.toBeInstanceOf(PrivilegedJobError);
  });

  it("rejects returning the privileged client and propagates callback failures", async () => {
    await expect(withPrivilegedJobClient(
      { config, scope: scope(), operation: "workflow:summary", now },
      async (client) => client,
    )).rejects.toBeInstanceOf(PrivilegedJobError);

    const failure = new Error("synthetic job failure");
    await expect(withPrivilegedJobClient(
      { config, scope: scope(), operation: "workflow:summary", now },
      async () => { throw failure; },
    )).rejects.toBe(failure);
  });

  it("keeps concurrent scopes on independent clients", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response();
    };
    await Promise.all([
      withPrivilegedJobClient({ config, scope: scope(), operation: "workflow:summary", now, fetch }, async (client) => {
        await client.from("children").select("id").limit(1);
        return "first";
      }),
      withPrivilegedJobClient({ config, scope: scope({ invocationId: "second" }), operation: "workflow:summary", now, fetch }, async (client) => {
        await client.from("children").select("id").limit(1);
        return "second";
      }),
    ]);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.headers.get("authorization") === `Bearer ${config.supabaseServiceRoleKey}`)).toBe(true);
  });

  it("has no imports from tools or channels", async () => {
    const source = await import("../../agent/lib/supabase/privileged-job-client");
    expect(Object.keys(source)).not.toContain("createClient");
  });
});
