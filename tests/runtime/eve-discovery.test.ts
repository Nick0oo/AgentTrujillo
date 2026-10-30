import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The executable module intentionally has no runtime declaration file.
const discovery = await import("../../scripts/verify-eve-discovery.mjs");
const module01FixturePath = resolve(process.cwd(), "tests/fixtures/runtime/eve-info-module-01.json");
const module10FixturePath = resolve(process.cwd(), "tests/fixtures/runtime/eve-info-module-10.json");
const module11FixturePath = resolve(process.cwd(), "tests/fixtures/runtime/eve-info-module-11.json");
const EXPECTED_TOOLS = [
  "capture_clinical_memory_candidate",
  "create_medication_plan",
  "evaluate_vaccination_schedule",
  "generate_vaccination_card",
  "get_growth_summary",
  "prepare_private_document_upload",
  "record_development_observation",
  "record_medication_intake",
  "record_vaccine_administration",
  "register_anthropometry",
  "search_child_clinical_memory",
  "suggest_pediatric_nutrition",
  "validate_declared_pediatric_dose",
] as const;

const sampleInfo = {
  appRoot: "C:\\workspace\\agent-trujillo",
  agentRoot: "C:\\workspace\\agent-trujillo\\agent",
  status: "ready",
  diagnostics: { errors: 0, warnings: 0 },
  model: "google/gemini-3.6-flash",
  instructions: "instructions.md",
  skills: ["tool-policy", "clinical-safety", "response-format"],
  tools: [],
  subagents: [],
  schedules: [],
  channels: [
    { name: "eve", kind: "http", method: "GET", urlPath: "/eve/v1/info" },
    { name: "eve", kind: "http", method: "GET", urlPath: "/eve/v1/session/:sessionId/stream" },
    { name: "eve", kind: "http", method: "POST", urlPath: "/eve/v1/session" },
    { name: "eve", kind: "http", method: "POST", urlPath: "/eve/v1/session/reset" },
    { name: "eve", kind: "http", method: "POST", urlPath: "/eve/v1/session/:sessionId" },
    { name: "eve", kind: "http", method: "POST", urlPath: "/eve/v1/session/:sessionId/cancel" },
  ],
  messaging: {
    create: "/eve/v1/session",
    continue: "/eve/v1/session/:sessionId",
    stream: "/eve/v1/session/:sessionId/stream",
  },
};

describe("Eve discovery gate", () => {
  it("extracts the first JSON object after the Eve banner", () => {
    expect(discovery.extractJson("☰eve v0.27.13\n{\"status\":\"ready\"}\n")).toEqual({ status: "ready" });
    expect(() => discovery.extractJson("☰eve v0.27.13\nnot-json")).toThrow();
  });

  it("canonicalizes provider, model, paths, sorted lists, and routes", () => {
    const projected = discovery.projectSurface(sampleInfo);
    expect(projected.provider).toBe("google.generative-ai");
    expect(projected.modelId).toBe("gemini-3.6-flash");
    expect(projected.appRoot).toBeUndefined();
    expect(projected.agentRoot).toBeUndefined();
    expect(projected.skills).toEqual(["clinical-safety", "response-format", "tool-policy"]);
    expect(projected.channels[0].method).toBe("GET");
  });

  it("compares exact surfaces and reports added or removed fields", () => {
    const expected = discovery.projectSurface(sampleInfo);
    expect(discovery.compareSurface(expected, expected)).toEqual([]);
    expect(discovery.compareSurface({ ...expected, skills: ["clinical-safety"] }, expected).join("\n")).toMatch(/skills/i);
    expect(discovery.compareSurface({ ...expected, tools: ["bash"] }, expected).join("\n")).toMatch(/tools|bash/i);
  });

  it("rejects forbidden default capability names even when info.tools is empty", () => {
    expect(discovery.findForbiddenNames({ tools: [], connections: [{ name: "web_search" }] })).toContain("web_search");
    expect(discovery.findForbiddenNames({ tools: [{ name: "evaluate_red_flags" }] })).toContain("evaluate_red_flags");
    expect(discovery.findForbiddenNames({ tools: [{ name: "contact_clinician" }] })).toContain("contact_clinician");
    expect(discovery.findForbiddenNames({ tools: [{ name: "clinician_handoff" }] })).toContain("clinician_handoff");
    expect(discovery.findForbiddenNames({ tools: [{ name: "filesystem" }] })).toContain("filesystem");
    expect(discovery.findForbiddenNames({ tools: [], connections: [] })).toEqual([]);
  });

  it("selects preserved historical fixtures and the current Module 11 baseline", () => {
    expect(discovery.fixtureFileForBaseline("module-01")).toBe("eve-info-module-01.json");
    expect(discovery.fixtureFileForBaseline("module-10")).toBe("eve-info-module-10.json");
    expect(discovery.fixtureFileForBaseline("module-11")).toBe("eve-info-module-11.json");
    expect(discovery.fixtureFileForBaseline("account-lifecycle")).toBe("eve-info-account-lifecycle.json");
    expect(discovery.DEFAULT_DISCOVERY_BASELINE).toBe("account-lifecycle");
    expect(() => discovery.fixtureFileForBaseline("module-12")).toThrow();
  });

  it.each([module01FixturePath, module10FixturePath, module11FixturePath])("keeps reviewed fixture %s canonical and free of host paths or secrets", (fixturePath) => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = readFileSync(fixturePath, "utf8");
    expect(fixture).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//i);
    expect(fixture).not.toMatch(/AIza|api[_-]?key|token|secret|child_id|guardian_id/i);
    expect(JSON.parse(fixture).modelId).toBe("gemini-3.6-flash");
  });

  it("preserves the Module 01 baseline and enforces the exact zero-warning Module 10 surface", () => {
    const module01 = JSON.parse(readFileSync(module01FixturePath, "utf8"));
    const module10 = JSON.parse(readFileSync(module10FixturePath, "utf8"));
    expect(module01.authoredTools).toEqual([]);
    expect(module10.authoredTools).toEqual(EXPECTED_TOOLS);
    expect(discovery.compareSurface(discovery.projectSurface({ ...sampleInfo, tools: [...EXPECTED_TOOLS] }), module10)).toEqual([]);
    expect(module10.diagnostics).toEqual({ errors: 0, warnings: 0 });
    expect(module10.skills).toEqual(["clinical-safety", "response-format", "tool-policy"]);
    expect(module10.subagents).toEqual([]);
    expect(module10.schedules).toEqual([]);
    expect(module10.channels).toContainEqual({
      name: "eve",
      kind: "http",
      method: "POST",
      urlPath: "/eve/v1/session/reset",
    });
  });

  it("freezes the sole public Creciendo family plus the protected Eve operator surface", () => {
    const module11 = JSON.parse(readFileSync(module11FixturePath, "utf8"));
    const creciendoRoutes = module11.channels.filter((route: { name: string }) => route.name === "creciendo");
    const eveRoutes = module11.channels.filter((route: { name: string }) => route.name === "eve");

    expect(module11.authoredTools).toEqual(EXPECTED_TOOLS);
    expect(module11.diagnostics).toEqual({ errors: 0, warnings: 0 });
    expect(creciendoRoutes).toEqual([
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/children" },
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/dashboard" },
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/documents" },
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/documents/:documentId/ocr-draft" },
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/immunization/status" },
      { name: "creciendo", kind: "http", method: "GET", urlPath: "/creciendo/v1/sessions/:sessionId/stream" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/child-context" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/documents/download-ticket" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/documents/upload-ticket" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/immunization/administrations" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/immunization/administration-drafts" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/onboarding" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/sessions" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/sessions/:sessionId/cancel" },
      { name: "creciendo", kind: "http", method: "POST", urlPath: "/creciendo/v1/sessions/:sessionId/messages" },
      { name: "creciendo", kind: "http", method: "PUT", urlPath: "/creciendo/v1/documents/upload" },
    ]);
    expect(eveRoutes).toHaveLength(6);
    expect(module11.channels).not.toContainEqual(expect.objectContaining({ urlPath: "/v1/chat" }));
    expect(module11.channels).not.toContainEqual(expect.objectContaining({ urlPath: "/v1" }));
  });
});
