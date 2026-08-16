import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import agentTool from "../../agent/tools/agent";

describe("runtime delegation lockdown", () => {
  it("disables root agent delegation", () => {
    expect(agentTool).toEqual({ kind: "eve:disabled-tool" });
  });

  it("contains no authored subagents or Workflow tool", () => {
    expect(existsSync("agent/subagents")).toBe(false);
    expect(existsSync("agent/tools/workflow.ts")).toBe(false);

    const source = readFileSync("agent/agent.ts", { encoding: "utf8" });
    expect(source).not.toMatch(/experimental_workflow|defineRemoteAgent|defineSubagent/);
  });
});
