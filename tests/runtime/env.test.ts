import { describe, expect, it } from "vitest";

import {
  RuntimeConfigError,
  loadRuntimeConfig,
} from "../../agent/lib/config/env";

const validKey = "AIzaSyA-test-key-that-is-long-enough";
const supabaseUrl = "https://example.supabase.co";
const supabasePublishableKey = "sb_publishable-test-key-that-is-long-enough";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    APP_ENV: "test",
    GOOGLE_GENERATIVE_AI_API_KEY: validKey,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
    ...overrides,
  };
}

describe("runtime environment boundary", () => {
  it.each(["development", "test", "preview", "production"])(
    "accepts APP_ENV=%s",
    (appEnv) => {
      const config = loadRuntimeConfig(env({ APP_ENV: appEnv }));

      expect(config.appEnv).toBe(appEnv);
      expect(config.googleApiKey).toBe(validKey);
      expect(config.supabaseUrl).toBe(supabaseUrl);
      expect(config.supabasePublishableKey).toBe(supabasePublishableKey);
    },
  );

  it("normalizes APP_ENV without transforming the secret", () => {
    const config = loadRuntimeConfig(
      env({ APP_ENV: "  PREVIEW  ", GOOGLE_GENERATIVE_AI_API_KEY: validKey }),
    );

    expect(config.appEnv).toBe("preview");
    expect(config.googleApiKey).toBe(validKey);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["whitespace-padded", ` ${validKey} `],
    ["short", "too-short"],
  ])("rejects a %s Google key", (_label, key) => {
    expect(() =>
      loadRuntimeConfig(env({ GOOGLE_GENERATIVE_AI_API_KEY: key })),
    ).toThrowError(RuntimeConfigError);
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() => loadRuntimeConfig(env({ APP_ENV: "staging" }))).toThrow(
      "ENV_INVALID",
    );
  });

  it("requires APP_ENV instead of silently choosing a deployment mode", () => {
    expect(() => loadRuntimeConfig(env({ APP_ENV: undefined }))).toThrow(
      "ENV_INVALID",
    );
  });

  it("ignores unrelated process variables", () => {
    const config = loadRuntimeConfig(
      env({ HOME: "/private/user", UNRELATED_SECRET: "do-not-copy" }),
    );

    expect(config).toEqual({
      appEnv: "test",
      googleApiKey: validKey,
      supabaseUrl,
      supabasePublishableKey,
      supabaseJwtIssuer: `${supabaseUrl}/auth/v1`,
      supabaseJwtAudience: "authenticated",
      supabaseJwtJwksUrl: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
    });
  });

  it("redacts values from invalid errors", () => {
    const error = (() => {
      try {
        loadRuntimeConfig(env({ APP_ENV: "nope" }));
        throw new Error("expected failure");
      } catch (caught) {
        return caught as RuntimeConfigError;
      }
    })();

    expect(error).toBeInstanceOf(RuntimeConfigError);
    expect(error.code).toBe("ENV_INVALID");
    expect(error.invalidFields).toEqual(["APP_ENV"]);
    expect(error.message).toBe("ENV_INVALID");
    expect(JSON.stringify(error)).not.toContain(validKey);
  });

  it("sorts and de-duplicates invalid field names", () => {
    const error = (() => {
      try {
        loadRuntimeConfig(env({ APP_ENV: "nope", GOOGLE_GENERATIVE_AI_API_KEY: "" }));
        throw new Error("expected failure");
      } catch (caught) {
        return caught as RuntimeConfigError;
      }
    })();

    expect(error.invalidFields).toEqual([
      "APP_ENV",
      "GOOGLE_GENERATIVE_AI_API_KEY",
    ]);
  });

  it("freezes the successful configuration", () => {
    const config = loadRuntimeConfig(env());

    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["blank", ""],
    ["short", "short"],
  ])("rejects a %s Supabase publishable key", (_label, key) => {
    expect(() => loadRuntimeConfig(env({ SUPABASE_PUBLISHABLE_KEY: key }))).toThrowError(RuntimeConfigError);
  });

  it("allows loopback HTTP only in local environments", () => {
    expect(loadRuntimeConfig(env({ APP_ENV: "test", SUPABASE_URL: "http://127.0.0.1:54321" })).supabaseUrl).toBe("http://127.0.0.1:54321");
    expect(() => loadRuntimeConfig(env({ APP_ENV: "production", SUPABASE_URL: "http://127.0.0.1:54321" }))).toThrowError(RuntimeConfigError);
  });

  it("rejects non-HTTPS non-loopback Supabase URLs", () => {
    expect(() => loadRuntimeConfig(env({ SUPABASE_URL: "http://supabase.internal" }))).toThrowError(RuntimeConfigError);
  });

  it("accepts a service-role key only as an optional trusted-runtime value", () => {
    const serviceRoleKey = "service-role-test-key-that-is-long-enough";
    expect(loadRuntimeConfig(env({ SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey })).supabaseServiceRoleKey).toBe(serviceRoleKey);
    expect(loadRuntimeConfig(env()).supabaseServiceRoleKey).toBeUndefined();
  });

  it("rejects a malformed optional service-role key without exposing it", () => {
    const error = (() => {
      try {
        loadRuntimeConfig(env({ SUPABASE_SERVICE_ROLE_KEY: "short" }));
        throw new Error("expected failure");
      } catch (caught) {
        return caught as RuntimeConfigError;
      }
    })();
    expect(error.invalidFields).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(JSON.stringify(error)).not.toContain("short");
  });

  it("validates child-context key pairs and distinct rotation KIDs", () => {
    const current = "A".repeat(43);
    const previous = "B".repeat(43);
    const configured = loadRuntimeConfig(env({
      CHILD_CONTEXT_SIGNING_KEY: current,
      CHILD_CONTEXT_SIGNING_KID: "current",
      CHILD_CONTEXT_PREVIOUS_SIGNING_KEY: previous,
      CHILD_CONTEXT_PREVIOUS_SIGNING_KID: "previous",
    }));
    expect(configured.childContextSigningKid).toBe("current");
    expect(() => loadRuntimeConfig(env({ CHILD_CONTEXT_SIGNING_KEY: current }))).toThrowError(RuntimeConfigError);
    expect(() => loadRuntimeConfig(env({ CHILD_CONTEXT_SIGNING_KEY: current, CHILD_CONTEXT_SIGNING_KID: "same", CHILD_CONTEXT_PREVIOUS_SIGNING_KEY: previous, CHILD_CONTEXT_PREVIOUS_SIGNING_KID: "same" }))).toThrowError(RuntimeConfigError);
  });
});
