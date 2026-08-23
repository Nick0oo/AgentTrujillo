import { describe, expect, it } from "vitest";

import { TrustedToolContextError } from "../../../agent/lib/runtime/trusted-tool-context";
import { ToolAuditError } from "../../../agent/lib/runtime/tool-audit";
import { ToolIdempotencyError } from "../../../agent/lib/runtime/tool-idempotency";
import {
  TOOL_ERROR_CODES,
  getPrivateToolErrorDiagnostics,
  isRetryableBeforeEffect,
  isSafeToolError,
  mapToolError,
  type SafeToolError,
  type SafeToolErrorPayload,
  type ToolErrorCode,
} from "../../../agent/lib/runtime/safe-tool-errors";

const EXPECTED_CODES: readonly ToolErrorCode[] = [
  "INPUT_INVALID",
  "RESOURCE_UNAVAILABLE",
  "CONFIRMATION_REQUIRED",
  "CONFIRMATION_INVALID",
  "IDEMPOTENCY_CONFLICT",
  "CLINICAL_POLICY_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
  "RATE_LIMITED",
  "TIMEOUT",
  "CANCELLED",
  "INTERNAL_UNAVAILABLE",
];

function payload(error: SafeToolError): SafeToolErrorPayload {
  return JSON.parse(JSON.stringify(error)) as SafeToolErrorPayload;
}

describe("safe tool errors", () => {
  it("exports one frozen small model-safe error vocabulary", () => {
    expect(TOOL_ERROR_CODES).toEqual(EXPECTED_CODES);
    expect(Object.isFrozen(TOOL_ERROR_CODES)).toBe(true);
    expect(new Set(TOOL_ERROR_CODES).size).toBe(12);
    expect(TOOL_ERROR_CODES.join("|")).not.toMatch(/sql|child|guardian|tenant|provider_name|diagnos|prescri|urgent/i);
  });

  it.each([
    [new Error("INVALID_INPUT"), "INPUT_INVALID"],
    [{ code: "INVALID_REQUEST" }, "INPUT_INVALID"],
    [{ code: "INVALID_OBSERVATION" }, "INPUT_INVALID"],
    [new Error("CONFIRMATION_REQUIRED"), "CONFIRMATION_REQUIRED"],
    [{ code: "CONFIRMATION_DRIFT" }, "CONFIRMATION_INVALID"],
    [{ code: "PREVIEW_DRIFT" }, "CONFIRMATION_INVALID"],
    [new ToolIdempotencyError("TOOL_IDEMPOTENCY_CONFLICT"), "IDEMPOTENCY_CONFLICT"],
    [{ code: "SUPERSESSION_CONFLICT" }, "IDEMPOTENCY_CONFLICT"],
    [new ToolIdempotencyError("TOOL_IDEMPOTENCY_UNAVAILABLE"), "PERSISTENCE_UNAVAILABLE"],
    [{ code: "RULE_UNAVAILABLE" }, "CLINICAL_POLICY_UNAVAILABLE"],
    [{ code: "PACKAGE_UNAVAILABLE" }, "CLINICAL_POLICY_UNAVAILABLE"],
    [{ code: "PROVIDER_UNAVAILABLE" }, "PROVIDER_UNAVAILABLE"],
    [{ code: "STORAGE_UNAVAILABLE" }, "PERSISTENCE_UNAVAILABLE"],
    [{ code: "CLOUD_PERSISTENCE_ERROR" }, "PERSISTENCE_UNAVAILABLE"],
    [{ code: "RATE_LIMITED" }, "RATE_LIMITED"],
    [{ code: "ETIMEDOUT" }, "TIMEOUT"],
    [new ToolIdempotencyError("TOOL_IDEMPOTENCY_CANCELLED"), "CANCELLED"],
    [new TrustedToolContextError("TOOL_CONTEXT_CANCELLED"), "CANCELLED"],
    [new TrustedToolContextError("TRUSTED_TOOL_CONTEXT_INVALID"), "RESOURCE_UNAVAILABLE"],
    [new ToolAuditError("TOOL_AUDIT_UNAVAILABLE"), "PERSISTENCE_UNAVAILABLE"],
  ] as const)("maps a known private failure to %s", (source, expected) => {
    const safe = mapToolError(source, { effectState: "none" });
    expect(safe.code).toBe(expected);
    expect(payload(safe)).toMatchObject({
      kind: "tool_error",
      version: "safe-tool-error.v1",
      code: expected,
    });
  });

  it("separates forbidden from not-found privately while exposing one non-enumerating result", () => {
    const forbidden = mapToolError({ code: "ACCESS_DENIED", childId: "sibling-secret" });
    const missing = mapToolError({ code: "MEDICATION_PLAN_NOT_FOUND", childId: "missing-secret" });
    expect(payload(forbidden)).toEqual(payload(missing));
    expect(forbidden.code).toBe("RESOURCE_UNAVAILABLE");
    expect(missing.code).toBe("RESOURCE_UNAVAILABLE");
    expect(getPrivateToolErrorDiagnostics(forbidden)).toMatchObject({ causeClass: "forbidden" });
    expect(getPrivateToolErrorDiagnostics(missing)).toMatchObject({ causeClass: "not_found" });
    expect(JSON.stringify(getPrivateToolErrorDiagnostics(forbidden))).not.toMatch(/sibling|child|ACCESS_DENIED/i);
  });

  it("defaults SQL/provider stacks, malicious messages, and arbitrary codes to internal unavailable", () => {
    const sources = [
      new Error("SQLSTATE 23505 child 00000000-0000-4000-8000-000000000003 duplicate https://db.invalid"),
      new Error("provider key sk_live_not-a-real-key failed for Patient Ana"),
      { code: "EVIL_CHILD_EXISTS", message: "sibling-secret" },
      { message: { nested: "raw PHI" }, stack: ["raw"] },
      "fever and medication details",
      null,
      undefined,
    ];
    for (const source of sources) {
      const safe = mapToolError(source, { effectState: "none" });
      expect(safe.code).toBe("INTERNAL_UNAVAILABLE");
      expect(payload(safe)).toEqual({
        kind: "tool_error",
        version: "safe-tool-error.v1",
        code: "INTERNAL_UNAVAILABLE",
        retryable: false,
        retryAfterSeconds: null,
      });
      expect(JSON.stringify(safe)).not.toMatch(/23505|child|db\.invalid|sk_live|Patient|Ana|fever|medication|PHI/i);
    }
  });

  it("fails closed when hostile errors or mapping options throw during inspection", () => {
    const hostileError = new Proxy({}, {
      getPrototypeOf: () => { throw new Error("secret prototype trap"); },
      ownKeys: () => { throw new Error("secret keys trap"); },
      get: () => { throw new Error("secret getter trap"); },
    });
    const hostileOptions = new Proxy({}, {
      ownKeys: () => { throw new Error("secret option trap"); },
    });

    expect(payload(mapToolError(hostileError, { effectState: "none" }))).toMatchObject({
      code: "INTERNAL_UNAVAILABLE",
      retryable: false,
    });
    expect(payload(mapToolError({ code: "PROVIDER_UNAVAILABLE" }, hostileOptions as never))).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      retryable: false,
    });
  });

  it("allows retry only for a known transient failure before any effect", () => {
    for (const source of [
      { code: "PROVIDER_UNAVAILABLE" },
      { code: "STORAGE_UNAVAILABLE" },
      { code: "ETIMEDOUT" },
      { code: "RATE_LIMITED" },
    ]) {
      const before = mapToolError(source, { effectState: "none" });
      const unknown = mapToolError(source, { effectState: "unknown" });
      const committed = mapToolError(source, { effectState: "committed" });
      expect(isRetryableBeforeEffect(before)).toBe(true);
      expect(before.retryable).toBe(true);
      expect(isRetryableBeforeEffect(unknown)).toBe(false);
      expect(isRetryableBeforeEffect(committed)).toBe(false);
    }
    expect(isRetryableBeforeEffect(mapToolError(new Error("unknown"), { effectState: "none" }))).toBe(false);
    expect(isRetryableBeforeEffect(mapToolError({ code: "IDEMPOTENCY_CONFLICT" }, { effectState: "none" }))).toBe(false);
    expect(isRetryableBeforeEffect({ code: "TIMEOUT", retryable: true } as never)).toBe(false);
  });

  it("never retries an effect-unknown timeout", () => {
    const before = mapToolError({ code: "TIMEOUT" }, { effectState: "none" });
    const ambiguous = mapToolError({ code: "TIMEOUT" }, { effectState: "unknown" });
    expect(payload(before)).toMatchObject({ code: "TIMEOUT", retryable: true });
    expect(payload(ambiguous)).toMatchObject({ code: "TIMEOUT", retryable: false });
  });

  it("accepts retry-after only for rate limits and only from 1 through 300 seconds", () => {
    for (const value of [1, 30, 300]) {
      expect(payload(mapToolError({ code: "RATE_LIMITED" }, { effectState: "none", retryAfterSeconds: value })))
        .toMatchObject({ retryable: true, retryAfterSeconds: value });
    }
    for (const value of [-1, 0, 301, 1.5, Number.NaN, "30", { seconds: 30 }]) {
      expect(payload(mapToolError(
        { code: "RATE_LIMITED" },
        { effectState: "none", retryAfterSeconds: value } as never,
      ))).toMatchObject({ retryable: true, retryAfterSeconds: null });
    }
    expect(payload(mapToolError(
      { code: "PROVIDER_UNAVAILABLE" },
      { effectState: "none", retryAfterSeconds: 30 },
    ))).toMatchObject({ retryable: true, retryAfterSeconds: null });
  });

  it("uses locale-neutral codes and never invents localized or clinical wording", () => {
    const spanish = mapToolError(new Error("El paciente Ana tiene fiebre"), { effectState: "none" });
    const english = mapToolError(new Error("Patient Ana has fever"), { effectState: "none" });
    expect(payload(spanish)).toEqual(payload(english));
    expect(JSON.stringify(spanish)).not.toMatch(/paciente|patient|Ana|fiebre|fever|doctor|urgenc|segur/i);
  });

  it("serializes exactly the safe payload without message, stack, cause, identifiers, or extras", () => {
    const safe = mapToolError({
      code: "PROVIDER_UNAVAILABLE",
      message: "signedUrl=https://storage.invalid/?token=secret",
      stack: "child-id sibling-id",
      childId: "00000000-0000-4000-8000-000000000003",
      prompt: "raw prompt",
      reasoning: "raw reasoning",
    }, { effectState: "none" });
    expect(Object.isFrozen(safe)).toBe(true);
    expect(payload(safe)).toEqual({
      kind: "tool_error",
      version: "safe-tool-error.v1",
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      retryAfterSeconds: null,
    });
    expect(JSON.stringify(safe)).not.toMatch(/message|stack|cause|signed|storage|token|child|sibling|prompt|reasoning/i);
  });

  it("stores the original cause only in a private weak registry and exposes redacted diagnostics", () => {
    const original = new Error("private child note and provider URL https://secret.invalid");
    const safe = mapToolError(original, { effectState: "unknown" });
    const diagnostics = getPrivateToolErrorDiagnostics(safe);
    if (!diagnostics) throw new Error("private diagnostics expected");
    expect(diagnostics).toMatchObject({
      schemaVersion: "tool-error-diagnostics.v1",
      causeClass: "unknown",
      effectState: "unknown",
      retryableBeforeEffect: false,
    });
    expect(diagnostics.sourceCodeSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|child|note|provider|secret|invalid/i);
    expect(Object.keys(safe)).not.toContain("cause");
  });

  it("is idempotent for branded safe errors and rejects structural lookalikes", () => {
    const safe = mapToolError({ code: "INVALID_INPUT" });
    expect(mapToolError(safe)).toBe(safe);
    expect(isSafeToolError(safe)).toBe(true);
    expect(isSafeToolError({ ...payload(safe) })).toBe(false);
    expect(getPrivateToolErrorDiagnostics({ ...payload(safe) } as never)).toBeNull();
  });

  it("fails closed on forged mapping options and records no authority data", () => {
    const safe = mapToolError(
      { code: "PROVIDER_UNAVAILABLE" },
      { effectState: "none", childId: "forged-child", entitlement: "premium" } as never,
    );
    expect(payload(safe)).toMatchObject({ code: "PROVIDER_UNAVAILABLE", retryable: false, retryAfterSeconds: null });
    expect(JSON.stringify(getPrivateToolErrorDiagnostics(safe))).not.toMatch(/forged|child|entitlement|premium/i);
  });
});
