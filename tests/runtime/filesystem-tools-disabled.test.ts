import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const disabledToolSlugs = ["bash", "read_file", "write_file", "glob", "grep"] as const;
const loadDisabledTool = {
  bash: () => import("../../agent/tools/bash"),
  read_file: () => import("../../agent/tools/read_file"),
  write_file: () => import("../../agent/tools/write_file"),
  glob: () => import("../../agent/tools/glob"),
  grep: () => import("../../agent/tools/grep"),
} as const;

describe("filesystem and shell tool lockdown", () => {
  it.each(disabledToolSlugs)("disables the %s default", async (slug) => {
    const module = await loadDisabledTool[slug]();

    expect(module.default).toEqual({ kind: "eve:disabled-tool" });
  });

  it("does not author an equivalent filesystem executor", async () => {
    for (const slug of disabledToolSlugs) {
      const source = await readFile(`agent/tools/${slug}.ts`, "utf8");

      expect(source).toBe("import { disableTool } from \"eve/tools\";\nexport default disableTool();\n");
      expect(source).not.toMatch(/node:(?:child_process|fs)|define(?:Bash|ReadFile|WriteFile|Glob|Grep)Tool/);
    }
  });
});
