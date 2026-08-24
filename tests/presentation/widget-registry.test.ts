import { describe, expect, it } from "vitest";

import { createCitationHandle } from "../../agent/lib/runtime/safe-to-model";
import { DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA } from "../../src/presentation/development-observation";
import { DOSE_VALIDATION_WIDGET_SCHEMA } from "../../src/presentation/dose-validation";
import { EMERGENCY_RECOMMENDATION_SCHEMA, presentEmergencyRecommendation } from "../../src/presentation/emergency-recommendation";
import { GROWTH_SUMMARY_WIDGET_SCHEMA } from "../../src/presentation/growth-summary";
import { GUARDIAN_CONFIRMATION_WIDGET_SCHEMA } from "../../src/presentation/guardian-confirmation";
import { MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA } from "../../src/presentation/medication-schedule-preview";
import { NUTRITION_GUIDANCE_WIDGET_SCHEMA } from "../../src/presentation/nutrition-guidance";
import { PROFESSIONAL_RECOMMENDATION_SCHEMA, presentProfessionalRecommendation } from "../../src/presentation/professional-recommendation";
import { SOURCE_LIST_WIDGET_SCHEMA, presentSourceList } from "../../src/presentation/source-list";
import { TOOL_STATE_SCHEMA } from "../../src/presentation/tool-state";
import { VACCINATION_STATUS_WIDGET_SCHEMA } from "../../src/presentation/vaccination-status";
import { renderProfessionalReview } from "../../src/safety/professional-review-policy";
import { urgentDecision } from "../../src/safety/safety-decision";
import {
  WIDGET_REGISTRY,
  WidgetRegistryError,
  negotiateWidgetVersion,
  parseWidgetEnvelope,
  renderFallbackText,
} from "../../src/presentation/widget-registry";

const EXPECTED = {
  growth_summary: "growth.summary.v1",
  vaccination_status: "vaccination.status.v1",
  medication_schedule_preview: "medication.schedule-preview.v1",
  development_observation_preview: "development.observation-preview.v1",
  nutrition_guidance: "nutrition.guidance.v1",
  guardian_confirmation: "guardian.confirmation.v1",
  professional_recommendation: "professional.recommendation.v1",
  emergency_recommendation: "emergency.recommendation.v1",
  source_list: "sources.list.v1",
  dose_validation: "medication.dose-validation.v1",
  tool_state: "tool.state.v1",
} as const;

const EXACT_SCHEMAS = {
  growth_summary: GROWTH_SUMMARY_WIDGET_SCHEMA,
  vaccination_status: VACCINATION_STATUS_WIDGET_SCHEMA,
  medication_schedule_preview: MEDICATION_SCHEDULE_PREVIEW_WIDGET_SCHEMA,
  development_observation_preview: DEVELOPMENT_OBSERVATION_PREVIEW_WIDGET_SCHEMA,
  nutrition_guidance: NUTRITION_GUIDANCE_WIDGET_SCHEMA,
  guardian_confirmation: GUARDIAN_CONFIRMATION_WIDGET_SCHEMA,
  professional_recommendation: PROFESSIONAL_RECOMMENDATION_SCHEMA,
  emergency_recommendation: EMERGENCY_RECOMMENDATION_SCHEMA,
  source_list: SOURCE_LIST_WIDGET_SCHEMA,
  dose_validation: DOSE_VALIDATION_WIDGET_SCHEMA,
  tool_state: TOOL_STATE_SCHEMA,
} as const;

function professional() {
  return presentProfessionalRecommendation(renderProfessionalReview("outside_basic_scope", "es-CO"), "es-CO");
}

function emergency() {
  return presentEmergencyRecommendation(
    urgentDecision(["synthetic-critical-rule"], "emergency_department_es_co_v1"),
    "es-CO",
  );
}

describe("widget registry and version negotiation", () => {
  it("registers exactly all eleven immutable presenter envelopes and exact versions", () => {
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const [kind, version] of Object.entries(EXPECTED)) {
      const entry = WIDGET_REGISTRY[kind as keyof typeof WIDGET_REGISTRY];
      expect(entry).toMatchObject({
        kind,
        version,
        rendererCompatibility: { protocol: "creciendo.widget.v1", major: 1 },
        modelPolicy: "exclude_payload",
        deprecation: { status: "active", acceptsUntil: null, replacementVersion: null },
      });
      expect(entry.maxBytes).toBeGreaterThan(0);
      expect(entry.schema).toBe(EXACT_SCHEMAS[kind as keyof typeof EXACT_SCHEMAS]);
      expect(Object.isFrozen(entry)).toBe(true);
    }
    expect(Object.isFrozen(WIDGET_REGISTRY)).toBe(true);
  });

  it("classifies text and terminal safety without inventing professional or emergency actions", () => {
    expect(WIDGET_REGISTRY.professional_recommendation).toMatchObject({
      eventKind: "safe_text",
      actionPolicy: "none",
    });
    expect(WIDGET_REGISTRY.emergency_recommendation).toMatchObject({
      eventKind: "terminal_safety",
      actionPolicy: "none",
    });
    expect(WIDGET_REGISTRY.guardian_confirmation.actionPolicy).toBe("confirmation_only");
  });

  it("parses known strict envelopes, deep-freezes them and preserves exact fallback text", () => {
    for (const widget of [professional(), emergency()]) {
      const parsed = parseWidgetEnvelope(widget);
      expect(parsed).toEqual(widget);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.data)).toBe(true);
      expect(renderFallbackText(widget)).toBe(widget.data.fallbackText);
    }
  });

  it("accepts only the source presenter's canonical public HTTPS fallback", () => {
    const toolId = "generate_vaccination_card" as const;
    const referenceCode = "who-growth-2026";
    const sourceDigest = "a".repeat(64);
    const source = {
      kind: "public_clinical_source" as const,
      citationHandle: createCitationHandle(toolId, { sourceDigest, referenceCode }),
      toolId,
      referenceCode,
      title: "WHO Child Growth Standards",
      jurisdiction: "GLOBAL",
      versionLabel: "2026.1",
      versionDate: "2026-01-15",
      effectiveFrom: "2026-01-15",
      effectiveUntil: null,
      accessedOn: "2026-08-23",
      sourceDigest,
      packageDigests: ["b".repeat(64)],
      current: true,
      revoked: false,
      canonicalUrl: "https://www.who.int/tools/child-growth-standards",
    };
    const widget = presentSourceList([source.citationHandle], [source], "en-US");
    expect(parseWidgetEnvelope(widget)).toEqual(widget);
    expect(renderFallbackText(widget)).toContain(source.canonicalUrl);
  });

  it("negotiates exact supported active versions only and never guesses upgrades or downgrades", () => {
    expect(negotiateWidgetVersion("growth_summary", ["growth.summary.v1"])).toBe("growth.summary.v1");
    expect(negotiateWidgetVersion("growth_summary", ["growth.summary.v0"])).toBeNull();
    expect(negotiateWidgetVersion("growth_summary", ["growth.summary.v2"])).toBeNull();
    expect(negotiateWidgetVersion("unknown_widget", ["unknown.v1"])).toBeNull();
    expect(negotiateWidgetVersion("growth_summary", "growth.summary.v1")).toBeNull();
    expect(negotiateWidgetVersion("growth_summary", ["growth.summary.v1", "growth.summary.v1"])).toBeNull();
  });

  it("rejects unknown versions/types, extra keys and incompatible emergency actions", () => {
    const known = professional();
    const attacks = [
      { ...known, kind: "unknown_widget" },
      { ...known, version: "professional.recommendation.v2" },
      { ...known, html: "<p>raw</p>" },
      { ...emergency(), data: { ...emergency().data, action: "open_map" } },
      { ...emergency(), data: { ...emergency().data, button: { label: "Call" } } },
    ];
    for (const attack of attacks) {
      expect(() => parseWidgetEnvelope(attack)).toThrow(WidgetRegistryError);
      expect(renderFallbackText(attack, "es-CO")).toBe("Contenido no disponible.");
      expect(renderFallbackText(attack, "en-US")).toBe("Content unavailable.");
    }
  });

  it("rejects oversized payloads before schema parsing", () => {
    const oversized = {
      ...professional(),
      data: { ...professional().data, fallbackText: "x".repeat(WIDGET_REGISTRY.professional_recommendation.maxBytes) },
    };
    try {
      parseWidgetEnvelope(oversized);
      throw new Error("expected registry rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(WidgetRegistryError);
      expect((error as WidgetRegistryError).code).toBe("WIDGET_TOO_LARGE");
      expect((error as Error).message).not.toContain("xxx");
    }
  });

  it("rejects prototype pollution, accessors, hidden/symbol data, cycles and BigInt without evaluating getters", () => {
    let getterRead = false;
    const getter = { ...professional() } as Record<string, unknown>;
    Object.defineProperty(getter, "kind", {
      enumerable: true,
      get() { getterRead = true; return "professional_recommendation"; },
    });
    const pollutedPrototype = Object.create({ polluted: true }) as Record<string, unknown>;
    Object.assign(pollutedPrototype, professional());
    const forbiddenKey = JSON.parse(JSON.stringify(professional())) as Record<string, unknown>;
    forbiddenKey["__proto__"] = { polluted: true };
    const cyclic = { ...professional() } as Record<string, unknown>;
    cyclic.self = cyclic;
    const bigint = { ...professional(), count: 1n };
    const hidden = { ...professional() } as Record<string, unknown>;
    Object.defineProperty(hidden, "hiddenPayload", { enumerable: false, value: "raw" });
    const symbolData = { ...professional(), [Symbol("hidden")]: "raw" };
    const trapped = new Proxy(professional(), {
      getPrototypeOf() { throw new Error("raw secret from proxy"); },
    });

    for (const attack of [getter, pollutedPrototype, forbiddenKey, cyclic, bigint, hidden, symbolData, trapped]) {
      try {
        parseWidgetEnvelope(attack);
        throw new Error("expected registry rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(WidgetRegistryError);
        expect((error as Error).message).not.toContain("raw secret");
      }
    }
    expect(getterRead).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("returns only bounded validated fallback and never raw JSON, HTML or attacker text", () => {
    const attack = {
      kind: "source_list",
      version: "sources.list.v1",
      data: { fallbackText: "<script>steal()</script>", secret: "raw-child-record" },
    };
    const fallback = renderFallbackText(attack, "en-US");
    expect(fallback).toBe("Content unavailable.");
    expect(fallback).not.toMatch(/script|secret|child|\{|\}/iu);
  });

  it("keeps registry schemas, negotiation and parsing deterministic with no side effects", () => {
    const widget = professional();
    expect(parseWidgetEnvelope(widget)).toEqual(parseWidgetEnvelope(widget));
    expect(negotiateWidgetVersion(widget.kind, [widget.version])).toBe(widget.version);
    expect(widget).toEqual(professional());
  });
});
