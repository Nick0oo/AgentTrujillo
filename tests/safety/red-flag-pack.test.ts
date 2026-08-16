import { describe, expect, it } from "vitest";

import { compileRedFlagPack, RedFlagPackError } from "../../src/safety/compile-red-flag-pack";
import { redFlagPackV1Schema } from "../../src/safety/red-flag-pack-schema";
import type { RedFlagPackV1 } from "../../src/safety/red-flag-pack-types";

const digest = "a".repeat(64);
const basePack: RedFlagPackV1 = {
  schemaVersion: "emergency-pack-v1",
  packageId: "synthetic-co-emergency",
  jurisdiction: "CO",
  locale: "es-CO",
  version: "1.0.0",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveUntil: null,
  algorithm: { key: "synthetic-safety", version: "1.0.0", implementationSha256: digest },
  sources: [{ id: "synthetic-source", digestSha256: digest }],
  copyKeys: ["emergency_department_es_co_v1"],
  approval: { status: "synthetic_test_only", artifactSha256: digest, approvalId: "synthetic-approval" },
  concepts: [{ id: "breathing-danger", patterns: ["respirar"] }],
  rules: [{
    code: "synthetic-breathing",
    priority: 100,
    population: { country: "CO" },
    predicate: { kind: "concept", conceptId: "breathing-danger", assertion: ["present"] },
    ambiguityPolicy: "urgent",
    decision: "urgent",
    copyKey: "emergency_department_es_co_v1",
    sourceIds: ["synthetic-source"],
  }],
};

describe("emergency rule-pack schema and compiler", () => {
  it("compiles a deterministic synthetic, non-executable pack", () => {
    const first = compileRedFlagPack({ pack: basePack, verification: "synthetic_test_only" });
    const second = compileRedFlagPack({ pack: structuredClone(basePack), verification: "synthetic_test_only" });
    expect(first.activation).toBe("synthetic_test_only");
    expect([...first.concepts.keys()]).toEqual(["breathing-danger"]);
    expect(first.rules).toEqual(second.rules);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("rejects jurisdiction/locale mixing and unknown/executable content", () => {
    expect(redFlagPackV1Schema.safeParse({ ...basePack, jurisdiction: "US" }).success).toBe(false);
    expect(redFlagPackV1Schema.safeParse({ ...basePack, concepts: [{ id: "x", patterns: ["https://example.invalid"] }] }).success).toBe(false);
    expect(redFlagPackV1Schema.safeParse({ ...basePack, rules: [{ ...basePack.rules[0], action: "call" }] }).success).toBe(false);
    expect(() => compileRedFlagPack({ pack: { ...basePack, rules: [{ ...basePack.rules[0], predicate: { kind: "concept", conceptId: "missing", assertion: ["present"] } }] }, verification: "synthetic_test_only" })).toThrowError(RedFlagPackError);
  });

  it("enforces bounded size, depth, and predicate limits", () => {
    const tooManyRules = { ...basePack, rules: Array.from({ length: 257 }, (_, index) => ({ ...basePack.rules[0], code: `rule-${index}` })) };
    expect(redFlagPackV1Schema.safeParse(tooManyRules).success).toBe(false);
    const tooManyPredicates = { ...basePack, rules: [{ ...basePack.rules[0], predicate: { kind: "all" as const, predicates: Array.from({ length: 33 }, () => basePack.rules[0].predicate) } }] };
    expect(redFlagPackV1Schema.safeParse(tooManyPredicates).success).toBe(false);
  });

  it("accepts only urgent decisions and preserves copy/source references", () => {
    expect(redFlagPackV1Schema.safeParse({ ...basePack, copyKeys: ["emergency_department_en_us_v1"] }).success).toBe(false);
    expect(redFlagPackV1Schema.safeParse({ ...basePack, rules: [{ ...basePack.rules[0], decision: "not_urgent" }] }).success).toBe(false);
  });
});
