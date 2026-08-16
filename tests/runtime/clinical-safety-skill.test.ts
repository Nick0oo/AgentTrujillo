import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "agent/skills/clinical-safety");
const skillPath = resolve(root, "SKILL.md");
const referencePath = resolve(root, "references/decision-boundaries.md");

describe("clinical safety runtime skill", () => {
  it("has a discoverable skill and a valid relative reference", () => {
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(referencePath)).toBe(true);
    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toMatch(/description:\s*[^\n]*(pediatric|child|safety)/i);
    expect(skill).toMatch(/references\/decision-boundaries\.md/);
  });

  it("defines the five permitted modes and trust order", () => {
    const skill = readFileSync(skillPath, "utf8");
    for (const mode of [
      "ordinary_guidance",
      "clarification_required",
      "professional_review",
      "emergency_recommendation",
      "abstain",
    ]) {
      expect(skill).toContain(mode);
    }
    expect(skill).toMatch(/deterministic safety result.*authorized structured facts.*confirmed clinical facts.*guardian statements.*unconfirmed/i);
    expect(skill).toMatch(/cannot downgrade|may become more cautious/i);
    expect(skill).toMatch(/active child|authorized.*scope/i);
  });

  it("keeps the skill procedural without clinical authority", () => {
    const combined = `${readFileSync(skillPath, "utf8")}\n${readFileSync(referencePath, "utf8")}`;
    expect(combined).not.toMatch(/evaluate_red_flags|prescribe medication|diagnose the child|dose formula|age threshold|z-score formula/i);
    expect(combined).toMatch(/do not infer|do not calculate|abstain/i);
    expect(combined).toMatch(/professional_review[\s\S]*pediatrician/i);
    expect(combined).toMatch(/emergency_recommendation[\s\S]*directly to the emergency department/i);
    expect(combined).toMatch(/prompt injection|untrusted.*instructions/i);
  });
});
