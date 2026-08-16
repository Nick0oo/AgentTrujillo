import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../agent/lib/config/env";
import {
  createPrimaryGoogleModel,
  PRIMARY_GOOGLE_MODEL_ID,
} from "../../agent/lib/model/google";

const runtimeConfig = {
  appEnv: "test",
  googleApiKey: "synthetic-provider-key-0123456789",
  supabaseUrl: "https://example.supabase.co",
  supabasePublishableKey: "sb_publishable-test-key-that-is-long-enough",
  supabaseJwtIssuer: "https://example.supabase.co/auth/v1",
  supabaseJwtAudience: "authenticated" as const,
  supabaseJwtJwksUrl: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
} as const;

describe("direct Gemini provider", () => {
  it("creates the reviewed stable Google language model without network I/O", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const model = createPrimaryGoogleModel(runtimeConfig);

    expect(PRIMARY_GOOGLE_MODEL_ID).toBe("gemini-3.6-flash");
    expect(typeof model).not.toBe("string");
    if (typeof model === "string") return;
    expect(model.provider).toBe("google.generative-ai");
    expect(model.modelId).toBe(PRIMARY_GOOGLE_MODEL_ID);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps missing provider configuration at the redacted env boundary", () => {
    expect(() =>
      loadRuntimeConfig({ APP_ENV: "test" }),
    ).toThrowError(/ENV_INVALID/);
  });

  it("contains no alternate provider or unstable model route", () => {
    const source = [
      readFileSync("agent/agent.ts", "utf8"),
      readFileSync("agent/lib/model/google.ts", "utf8"),
    ].join("\n");

    expect(source).not.toMatch(/anthropic\//i);
    expect(source).not.toMatch(/openrouter/i);
    expect(source).not.toMatch(/google\//i);
    expect(source).not.toMatch(/gemini-[^\s"']+-latest/i);
    expect(source).not.toMatch(/preview|experimental/i);
  });
});
