import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import instrumentation from "../../agent/instrumentation";
import {
  SAFE_RUNTIME_CONTEXT_KEYS,
  assertSafeRuntimeContext,
  normalizeSafeRuntimeContext,
} from "../../agent/lib/observability/privacy";

const instrumentationSourcePath = new URL(
  "../../agent/instrumentation.ts",
  import.meta.url,
);

describe("privacy-safe Eve instrumentation", () => {
  it("uses the real Eve definition with explicit privacy defaults", () => {
    expect(instrumentation).toEqual({
      functionId: "agent-trujillo",
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it("does not configure setup, events, exporters, or content payloads", async () => {
    const source = await readFile(instrumentationSourcePath, "utf8");

    expect(source).toContain("defineInstrumentation({");
    expect(source).not.toMatch(/\bsetup\b/);
    expect(source).not.toMatch(/\bevents\b/);
    expect(source).not.toMatch(/modelInput|messages|prompt|output|exporter|registerOTel|OpenTelemetry/);
  });

  it("allows only the bounded opaque runtime vocabulary", () => {
    expect(SAFE_RUNTIME_CONTEXT_KEYS).toEqual([
      "agent.correlation_id",
      "agent.provider_route",
      "agent.channel_kind",
      "agent.tool_name",
      "agent.tool_status",
      "agent.failure_class",
      "agent.safety_mode",
    ]);

    expect(() =>
      assertSafeRuntimeContext({
        "agent.correlation_id": "corr_opaque_01",
        "agent.provider_route": "google/gemini-3.6-flash",
        "agent.channel_kind": "http",
        "agent.tool_name": "none",
        "agent.tool_status": "not_used",
        "agent.failure_class": "none",
        "agent.safety_mode": "standard",
      }),
    ).not.toThrow();
  });

  it("rejects PHI/PII-like keys, content, identity, and non-scalars", () => {
    const forbiddenContexts = [
      { "agent.child_id": "child_opaque_01" },
      { "agent.guardian_email": "synthetic.guardian@example.invalid" },
      { "agent.patient_name": "Synthetic Patient" },
      { "agent.symptom": "synthetic fever marker" },
      { "agent.prompt": "synthetic input marker" },
      { "agent.output": "synthetic output marker" },
      { "agent.tool_payload": "synthetic payload marker" },
      {
        "agent.correlation_id":
          "synthetic-correlation-id-that-is-too-long-for-runtime-context-boundaries",
      },
      { "agent.safety_mode": { value: "standard" } },
      { "agent.safety_mode": null },
      { "agent.safety_mode": true },
      { "eve.session.id": "reserved" },
    ];

    for (const context of forbiddenContexts) {
      expect(() => assertSafeRuntimeContext(context)).toThrow();
    }
  });

  it("normalizes accepted scalar values and fails closed instead of redacting unknown data", () => {
    expect(
      normalizeSafeRuntimeContext({
        "agent.correlation_id": "  corr_opaque_02  ",
        "agent.provider_route": " google/gemini-3.6-flash ",
        "agent.channel_kind": " http ",
        "agent.tool_name": " none ",
        "agent.tool_status": " not_used ",
        "agent.failure_class": " none ",
        "agent.safety_mode": " standard ",
      }),
    ).toEqual({
      "agent.correlation_id": "corr_opaque_02",
      "agent.provider_route": "google/gemini-3.6-flash",
      "agent.channel_kind": "http",
      "agent.tool_name": "none",
      "agent.tool_status": "not_used",
      "agent.failure_class": "none",
      "agent.safety_mode": "standard",
    });

    expect(() =>
      normalizeSafeRuntimeContext({
        "agent.provider_route": "Synthetic Patient fever marker",
      }),
    ).toThrow();
  });
});
