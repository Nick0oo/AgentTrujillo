import { describe, expect, it } from "vitest";

import {
  RuntimeConfigError,
  loadRuntimeConfig,
} from "../../agent/lib/config/env";

const validKey = "AIzaSyA-test-key-that-is-long-enough";

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    APP_ENV: "test",
    GOOGLE_GENERATIVE_AI_API_KEY: validKey,
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

    expect(config).toEqual({ appEnv: "test", googleApiKey: validKey });
  });

  it("redacts values from invalid errors", () => {
    const error = (() => {
      try {
        loadRuntimeConfig({ APP_ENV: "nope", GOOGLE_GENERATIVE_AI_API_KEY: validKey });
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
        loadRuntimeConfig({ APP_ENV: "nope", GOOGLE_GENERATIVE_AI_API_KEY: "" });
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
});
