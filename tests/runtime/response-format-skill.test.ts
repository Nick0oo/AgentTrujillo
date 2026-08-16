import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "agent/skills/response-format");
const skillPath = resolve(root, "SKILL.md");
const examplesPath = resolve(root, "references/mode-examples.md");

describe("response format runtime skill", () => {
  it("defines exactly the five permitted response modes", () => {
    const text = readFileSync(skillPath, "utf8");
    for (const mode of ["guidance", "clarification", "professional_review", "emergency_recommendation", "recoverable_error"]) {
      expect(text).toContain(mode);
    }
    expect(text).toMatch(/one permitted response mode|mode table/i);
    expect(text).toMatch(/at most one next step|one next step/i);
    expect(text).toMatch(/Colombian Spanish|neutral US English/i);
  });

  it("has paired examples, non-examples, and provenance rules", () => {
    const examples = readFileSync(examplesPath, "utf8");
    expect(examples).toMatch(/English/i);
    expect(examples).toMatch(/Español colombiano|Colombian Spanish/i);
    expect(examples).toMatch(/Non-example|No permitido/i);
    expect(examples).toMatch(/known|uncertain|provenance|procedencia/i);
  });

  it("keeps emergency output terminal and non-executable", () => {
    const text = readFileSync(skillPath, "utf8");
    const urgent = text.match(/## Emergency mode[\s\S]*?(?=\n## |$)/i)?.[0] ?? "";
    expect(urgent).toMatch(/only recommend going directly to the emergency department/i);
    expect(urgent).not.toMatch(/diagnos|treatment|home|question|caveat|follow-up|phone|map|booking|appointment|notification|button|url/i);
    expect(text).not.toMatch(/<\/?(script|button|html)|javascript:|onClick/i);
    expect(text).not.toMatch(/diagnose|prescribe|dose is safe/i);
  });
});
