import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The executable module intentionally has no runtime declaration file.
const discovery = await import("../../scripts/verify-eve-discovery.mjs");
const fixturePath = resolve(process.cwd(), "tests/fixtures/runtime/eve-info-module-01.json");

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
    expect(discovery.extractJson("☰eve v0.27.1\n{\"status\":\"ready\"}\n")).toEqual({ status: "ready" });
    expect(() => discovery.extractJson("☰eve v0.27.1\nnot-json")).toThrow();
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
    expect(discovery.findForbiddenNames({ tools: [], connections: [] })).toEqual([]);
  });

  it("keeps the reviewed fixture canonical and free of host paths or secrets", () => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = readFileSync(fixturePath, "utf8");
    expect(fixture).not.toMatch(/[A-Z]:\\|\/Users\/|\/home\//i);
    expect(fixture).not.toMatch(/AIza|api[_-]?key|token|secret|child_id|guardian_id/i);
    expect(JSON.parse(fixture).modelId).toBe("gemini-3.6-flash");
  });

  it("enforces a zero-warning, exact runtime surface", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(discovery.compareSurface(discovery.projectSurface(sampleInfo), fixture)).toEqual([]);
    expect(fixture.diagnostics).toEqual({ errors: 0, warnings: 0 });
    expect(fixture.skills).toEqual(["clinical-safety", "response-format", "tool-policy"]);
    expect(fixture.authoredTools).toEqual([]);
    expect(fixture.subagents).toEqual([]);
    expect(fixture.schedules).toEqual([]);
  });
});
