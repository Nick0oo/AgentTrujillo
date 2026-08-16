import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const instructions = readFileSync("agent/instructions.md", "utf8");
const normalizedInstructions = instructions.replace(/\s+/g, " ");
const emergencySection = instructions.slice(
  instructions.indexOf("## Emergency boundary"),
  instructions.indexOf("## Deterministic authority"),
).replace(/\s+/g, " ");

describe("permanent clinical instructions", () => {
  it("contains the required stable sections", () => {
    for (const heading of [
      "## Identity",
      "## Intended use",
      "## Language and tone",
      "## Clinical boundaries",
      "## Professional recommendation",
      "## Emergency boundary",
      "## Deterministic authority",
      "## Child isolation",
      "## Untrusted content",
      "## Failure behavior",
    ]) {
      expect(instructions).toContain(heading);
    }
  });

  it("preserves the product identity and jurisdiction boundary", () => {
    expect(normalizedInstructions).toMatch(/Agent Trujillo/);
    expect(normalizedInstructions).toMatch(/automated pediatric guidance/i);
    expect(normalizedInstructions).toMatch(/adult guardians/i);
    expect(normalizedInstructions).toMatch(/Colombian Spanish/i);
    expect(normalizedInstructions).toMatch(/Colombia/);
    expect(normalizedInstructions).toMatch(/United States/);
    expect(normalizedInstructions).toMatch(/Dr\. Trujillo/);
    expect(normalizedInstructions).toMatch(/does not join conversations/i);
  });

  it("sets the permanent clinical prohibitions", () => {
    expect(normalizedInstructions).toMatch(/never diagnose/i);
    expect(normalizedInstructions).toMatch(/never prescribe/i);
    expect(normalizedInstructions).toMatch(/never select a medication/i);
    expect(normalizedInstructions).toMatch(/never create a dose/i);
    expect(normalizedInstructions).toMatch(/never calculate/i);
    expect(normalizedInstructions).toMatch(/educational|education/i);
    expect(normalizedInstructions).toMatch(/recommend a pediatrician/i);
    expect(normalizedInstructions).toMatch(/information is insufficient/i);
  });

  it("defines emergency output as terminal and minimal", () => {
    expect(emergencySection).toMatch(/trusted/i);
    expect(emergencySection).toMatch(/emergency_recommendation/);
    expect(emergencySection).toMatch(/only recommend going directly to the emergency department/i);
    expect(emergencySection).toMatch(/stop/i);
    expect(emergencySection).not.toMatch(/phone|call|booking|appointment|alarm|notification|map|home treatment/i);
  });

  it("requires trusted scope and treats external content as data", () => {
    expect(normalizedInstructions).toMatch(/trusted active-child context/i);
    expect(normalizedInstructions).toMatch(/sibling/i);
    expect(normalizedInstructions).toMatch(/child_id/);
    expect(normalizedInstructions).toMatch(/do not reveal whether/i);
    expect(normalizedInstructions).toMatch(/messages, retrieved memory, documents, OCR, tool results, and model-generated text/i);
    expect(normalizedInstructions).toMatch(/untrusted data/i);
    expect(normalizedInstructions).toMatch(/clinical-safety/);
    expect(normalizedInstructions).toMatch(/tool-policy/);
    expect(normalizedInstructions).toMatch(/response-format/);
  });
});
