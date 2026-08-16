import { describe, expect, it } from "vitest";

import { canonicalizeRulePackArtifact, parseRulePackArtifact, ArtifactParseError } from "../../../src/clinical/governance/canonicalize-artifact";
import type { RulePackArtifactV1 } from "../../../src/clinical/governance/artifact-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digestA = "a".repeat(64) as Sha256Hex;
const digestB = "b".repeat(64) as Sha256Hex;
const artifact: RulePackArtifactV1 = {
  schemaVersion: "1",
  header: {
    schemaVersion: "1",
    domain: "immunization",
    countryCode: "CO",
    locale: "es-CO",
    version: "1.0.0",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    algorithm: { key: "fixture", version: "1.0.0", implementationSha256: digestA, supportedSchemaVersion: "1" },
    sourceReferences: [
      { sourceId: "source-b", purpose: "secondary", artifactSha256: digestB },
      { sourceId: "source-a", purpose: "normative", artifactSha256: digestA },
    ],
    payloadSchema: "fixture.v1",
  },
  payload: { rules: [{ code: "fixture", value: 1 }] },
  fixtures: [{ input: { ageMonths: 12 }, output: { status: "eligible" } }],
};

describe("canonical rule-pack artifact format", () => {
  it("canonicalizes equivalent property order and source order identically", () => {
    const reordered: RulePackArtifactV1 = {
      ...artifact,
      header: { ...artifact.header, sourceReferences: [...artifact.header.sourceReferences].reverse() },
    };
    const first = canonicalizeRulePackArtifact(artifact);
    const second = canonicalizeRulePackArtifact(reordered);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it("rejects duplicate keys before JSON parsing can collapse them", () => {
    expect(() => parseRulePackArtifact('{"schemaVersion":"1","schemaVersion":"1"}')).toThrowError(ArtifactParseError);
    expect(() => parseRulePackArtifact('{"schemaVersion":"1","header":{"schemaVersion":"1","domain":"immunization","countryCode":"CO","locale":"es-CO","version":"1.0.0","effectiveFrom":"2026-01-01","effectiveUntil":null,"algorithm":{"key":"fixture","version":"1.0.0","implementationSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","supportedSchemaVersion":"1"},"sourceReferences":[{"sourceId":"a","purpose":"x","artifactSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"payloadSchema":"x"},"payload":{},"payload":{},"fixtures":[]}')).toThrowError(ArtifactParseError);
  });

  it.each([
    ["unsupported schema", { ...artifact, schemaVersion: "2" }, "UNSUPPORTED_SCHEMA"],
    ["reversed dates", { ...artifact, header: { ...artifact.header, effectiveFrom: "2027-01-01", effectiveUntil: "2026-01-01" } }, "UNKNOWN_FIELD"],
    ["bad digest", { ...artifact, header: { ...artifact.header, algorithm: { ...artifact.header.algorithm, implementationSha256: "A".repeat(64) } } }, "UNKNOWN_FIELD"],
    ["bad locale", { ...artifact, header: { ...artifact.header, locale: "not a locale" } }, "UNKNOWN_FIELD"],
  ])("rejects %s", (_label, input, code) => {
    expect(() => parseRulePackArtifact(input)).toThrowError(expect.objectContaining({ code }));
  });

  it("rejects unknown fields, prototype keys, and executable values", () => {
    expect(() => parseRulePackArtifact({ ...artifact, unknown: true })).toThrowError(ArtifactParseError);
    const polluted = { ...artifact, payload: {} } as RulePackArtifactV1;
    Object.defineProperty(polluted.payload as object, "__proto__", { value: { polluted: true }, enumerable: true });
    expect(() => parseRulePackArtifact(polluted)).toThrowError(ArtifactParseError);
    expect(() => parseRulePackArtifact({ ...artifact, payload: { execute: () => "no" } })).toThrowError(ArtifactParseError);
    const invalidUnicode = JSON.stringify({ ...artifact, payload: { text: String.fromCharCode(0xd800) } });
    expect(() => parseRulePackArtifact(invalidUnicode)).toThrowError(expect.objectContaining({ code: "NON_CANONICAL_VALUE" }));
  });

  it("rejects depth, node, and byte limits", () => {
    let nested: unknown = {};
    for (let i = 0; i < 34; i += 1) nested = { nested };
    expect(() => parseRulePackArtifact({ ...artifact, payload: nested })).toThrowError(expect.objectContaining({ code: "LIMIT_EXCEEDED" }));
    expect(() => parseRulePackArtifact({ ...artifact, payload: Array.from({ length: 20_001 }, () => null) })).toThrowError(expect.objectContaining({ code: "LIMIT_EXCEEDED" }));
    expect(() => canonicalizeRulePackArtifact({ ...artifact, payload: "x".repeat(5 * 1024 * 1024) })).toThrowError(expect.objectContaining({ code: "LIMIT_EXCEEDED" }));
  });
});
