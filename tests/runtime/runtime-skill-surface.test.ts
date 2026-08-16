import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillRoot = resolve(process.cwd(), "agent/skills");
const expected = ["clinical-safety", "response-format", "tool-policy"] as const;

describe("runtime skill surface", () => {
  it("removes the Eve developer skill and keeps only product skills", () => {
    expect(existsSync(resolve(skillRoot, "eve/SKILL.md"))).toBe(false);
    const discovered = readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(skillRoot, entry.name, "SKILL.md")))
      .map((entry) => entry.name)
      .sort();
    expect(discovered).toEqual([...expected].sort());
    expect(discovered).not.toContain("eve");
  });

  it("does not leave development instructions in runtime skills", () => {
    const contents = readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => [resolve(skillRoot, entry.name, "SKILL.md")])
      .filter(existsSync)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    expect(contents).not.toMatch(/edit files|write code|run shell|modify the Eve agent/i);
  });
});
