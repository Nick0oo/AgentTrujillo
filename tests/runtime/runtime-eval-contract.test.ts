import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const evalRoot = resolve(process.cwd(), "evals/runtime");
const expectedFiles = [
  "emergency-boundary.eval.ts",
  "identity.eval.ts",
  "non-diagnosis.eval.ts",
  "professional-review.eval.ts",
  "prompt-injection.eval.ts",
  "tool-lockdown.eval.ts",
].sort();

describe("runtime smoke eval contract", () => {
  it("discovers exactly six focused synthetic evals", () => {
    expect(readdirSync(evalRoot).filter((name) => name.endsWith(".eval.ts")).sort()).toEqual(expectedFiles);
    expect(existsSync(resolve(process.cwd(), "evals/evals.config.ts"))).toBe(true);
  });

  it("uses runtime and smoke tags with deterministic inline assertions", () => {
    for (const file of expectedFiles) {
      const source = readFileSync(resolve(evalRoot, file), "utf8");
      expect(source).toContain("defineEval");
      expect(source).toMatch(/tags:\s*\["runtime",\s*"smoke"/);
      expect(source).toContain("t.succeeded()");
      expect(source).toContain("t.noFailedActions()");
    }
  });

  it("keeps direct Gemini as the only target and configures no judge or fallback", () => {
    const config = readFileSync(resolve(process.cwd(), "evals/evals.config.ts"), "utf8");
    const allEvalSource = expectedFiles
      .map((file) => readFileSync(resolve(evalRoot, file), "utf8"))
      .join("\n");
    expect(config).not.toMatch(/\bjudge\b|reporter|fallback|openai|anthropic|gateway/i);
    expect(allEvalSource).not.toMatch(/judge|autoeval|second provider|fallback/i);
  });

  it("requires safety, professional, emergency, and lockdown assertions", () => {
    const source = expectedFiles
      .map((file) => readFileSync(resolve(evalRoot, file), "utf8"))
      .join("\n");
    expect(source).toContain('t.loadedSkill("clinical-safety")');
    expect(source).toContain('t.loadedSkill("response-format")');
    expect(source).toContain("pediatrician");
    expect(source).toContain("emergency department");
    for (const tool of ["bash", "read_file", "write_file", "glob", "grep", "web_fetch", "web_search", "agent", "workflow"]) {
      expect(source).toContain('t.notCalledTool("' + tool + '")');
    }
  });

  it("centralizes synthetic prompts and rejects sensitive fixture patterns", () => {
    const fixtures = readFileSync(resolve(evalRoot, "fixtures.ts"), "utf8");
    expect(fixtures).toMatch(/RUNTIME_FIXTURES/);
    expect(fixtures).toMatch(/FORBIDDEN_OUTPUT_PATTERNS/);
    expect(fixtures).toMatch(/SYNTHETIC_MARKERS/);
    expect(fixtures).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    expect(fixtures).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
    expect(fixtures).not.toMatch(/\b(?:sk|AIza)[-_][A-Za-z0-9_-]{12,}\b/);
    expect(fixtures).not.toMatch(/\/(?:Users|home)\/|[A-Z]:\\/i);
  });
});
