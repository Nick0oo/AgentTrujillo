import { describe, expect, it } from "vitest";

import {
  createRequestSupabaseClient,
  RequestSupabaseClientError,
} from "../../agent/lib/supabase/request-client";
import type { SupabaseBearerToken } from "../../agent/lib/supabase/types";

const config = {
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "sb_publishable-test-key-that-is-long-enough",
} as const;

function token(value: string): SupabaseBearerToken {
  return value as SupabaseBearerToken;
}

function response(): Response {
  return new Response(JSON.stringify({ data: [], error: null }), {
    status: 200,
    headers: { "content-type": "application/json", "content-range": "0-0/*" },
  });
}

describe("request-scoped Supabase client", () => {
  it("sends the verified bearer and publishable key through the injected transport", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response();
    };

    const client = createRequestSupabaseClient({ config, accessToken: token("token-a"), fetch });
    await client.from("children").select("id").limit(1);

    expect(requests).toHaveLength(1);
    expect(requests[0].headers.get("authorization")).toBe("Bearer token-a");
    expect(requests[0].headers.get("apikey")).toBe(config.supabasePublishableKey);
    expect(requests[0].url).toContain("/rest/v1/children");
  });

  it("keeps interleaved clients isolated and does not persist or refresh sessions", async () => {
    const requests: Request[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init));
      return response();
    };

    const first = createRequestSupabaseClient({ config, accessToken: token("token-first"), fetch });
    const second = createRequestSupabaseClient({ config, accessToken: token("token-second"), fetch });
    await Promise.all([
      first.from("children").select("id").limit(1),
      second.from("children").select("id").limit(1),
    ]);

    expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
      "Bearer token-first",
      "Bearer token-second",
    ]);
    expect(first).not.toBe(second);
    expect("getSession" in first.auth).toBe(true);
  });

  it("rejects a blank token with a value-free error", () => {
    expect(() => createRequestSupabaseClient({ config, accessToken: token(" ") })).toThrowError(RequestSupabaseClientError);
    expect(() => createRequestSupabaseClient({ config, accessToken: token(" ") })).toThrow("SUPABASE_REQUEST_CLIENT_INVALID");
  });

  it("does not expose a service-role fallback or singleton export", async () => {
    const source = await import("../../agent/lib/supabase/request-client");
    expect(Object.keys(source)).not.toContain("serviceRole");
    expect(Object.keys(source)).not.toContain("client");
  });
});
