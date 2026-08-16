import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AGENT_RUNTIME_POLICY } from "../../agent/lib/runtime/policy";

describe("durable agent runtime policy", () => {
  it("uses the reviewed reasoning, compaction, and session limits", () => {
    expect(AGENT_RUNTIME_POLICY).toEqual({
      reasoning: "medium",
      compaction: { thresholdPercent: 0.75 },
      limits: {
        maxInputTokensPerSession: 250_000,
        maxOutputTokensPerSession: 30_000,
      },
    });
  });

  it("is immutable and keeps finite positive bounds", () => {
    expect(Object.isFrozen(AGENT_RUNTIME_POLICY)).toBe(true);
    expect(Object.isFrozen(AGENT_RUNTIME_POLICY.compaction)).toBe(true);
    expect(Object.isFrozen(AGENT_RUNTIME_POLICY.limits)).toBe(true);
    expect(AGENT_RUNTIME_POLICY.compaction.thresholdPercent).toBeGreaterThan(0);
    expect(AGENT_RUNTIME_POLICY.compaction.thresholdPercent).toBeLessThan(1);
    expect(Number.isInteger(AGENT_RUNTIME_POLICY.limits.maxInputTokensPerSession)).toBe(true);
    expect(Number.isInteger(AGENT_RUNTIME_POLICY.limits.maxOutputTokensPerSession)).toBe(true);
    expect(AGENT_RUNTIME_POLICY.limits.maxOutputTokensPerSession).toBeLessThan(
      AGENT_RUNTIME_POLICY.limits.maxInputTokensPerSession,
    );
  });

  it("is consumed as the single source of literals by agent.ts", () => {
    const source = readFileSync("agent/agent.ts", "utf8");

    expect(source).toContain("...AGENT_RUNTIME_POLICY");
    expect(source).not.toMatch(/thresholdPercent|maxInputTokensPerSession|maxOutputTokensPerSession/);
  });
});
