import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import sandbox from "../../agent/sandbox";

describe("sandbox network policy", () => {
  it("defines an Eve sandbox backend", () => {
    expect(sandbox.backend).toBeDefined();
  });

  it("sets deny-all on every real backend and keeps just-bash virtual", () => {
    const source = readFileSync("agent/sandbox.ts", "utf8");

    expect(source).toMatch(/defaultBackend\(\{/);
    expect(source.match(/networkPolicy:\s*["']deny-all["']/g)).toHaveLength(3);
    expect(source).toMatch(/justBash:\s*\{\s*autoInstall:\s*true\s*\}/s);
    expect(source).not.toMatch(/allow-all|networkPolicy:\s*["']\*["']|setNetworkPolicy|bootstrap/);
  });
});
