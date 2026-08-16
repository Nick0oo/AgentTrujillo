import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { canonicalizeRulePackArtifact } from "../../../src/clinical/governance/canonicalize-artifact";
import { ChecksumError, computeSha256, verifyArtifactBytes, verifyArtifactStream } from "../../../src/clinical/governance/checksum";
import type { RulePackArtifactV1 } from "../../../src/clinical/governance/artifact-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";

const digest = "a".repeat(64) as Sha256Hex;
const artifact: RulePackArtifactV1 = {
  schemaVersion: "1",
  header: {
    schemaVersion: "1", domain: "immunization", countryCode: "CO", locale: "es-CO", version: "1.0.0",
    effectiveFrom: "2026-01-01", effectiveUntil: null,
    algorithm: { key: "fixture", version: "1.0.0", implementationSha256: digest, supportedSchemaVersion: "1" },
    sourceReferences: [{ sourceId: "source-a", purpose: "normative", artifactSha256: digest }], payloadSchema: "fixture.v1",
  },
  payload: { rules: [{ code: "fixture", value: 1 }] }, fixtures: [],
};
const bytes = canonicalizeRulePackArtifact(artifact);
const expected = createHash("sha256").update(bytes).digest("hex");

async function* chunks(value: Uint8Array, size: number) {
  for (let index = 0; index < value.length; index += size) yield value.slice(index, index + size);
}

describe("clinical artifact checksum verification", () => {
  it("computes and verifies the golden digest", () => {
    expect(computeSha256(bytes)).toBe(expected);
    expect(verifyArtifactBytes(bytes, expected).digest).toBe(expected);
  });

  it("rejects mutations and all invalid digest spellings", () => {
    const mutated = Uint8Array.from(bytes);
    mutated[mutated.length - 1] ^= 1;
    expect(() => verifyArtifactBytes(mutated, expected)).toThrowError(expect.objectContaining({ code: "HASH_MISMATCH" }));
    for (const invalid of [expected.toUpperCase(), expected.slice(1), `${expected}00`, expected.replace("a", "g")]) {
      expect(() => verifyArtifactBytes(bytes, invalid)).toThrowError(ChecksumError);
    }
  });

  it("rejects non-canonical equivalent JSON before verification", () => {
    const nonCanonical = Buffer.from(JSON.stringify(artifact));
    const hash = createHash("sha256").update(nonCanonical).digest("hex");
    expect(() => verifyArtifactBytes(nonCanonical, hash)).toThrowError(expect.objectContaining({ code: "NON_CANONICAL_ARTIFACT" }));
  });

  it("verifies stream boundaries and enforces exact size limits", async () => {
    await expect(verifyArtifactStream(chunks(bytes, 3), expected)).resolves.toMatchObject({ digest: expected });
    await expect(verifyArtifactStream(chunks(bytes, 3), expected, { maxBytes: bytes.length - 1 })).rejects.toMatchObject({ code: "SIZE_LIMIT" });
    await expect(verifyArtifactStream(chunks(bytes, 3), expected, { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("rejects empty, oversized, invalid UTF-8, and non-artifact bytes", () => {
    expect(() => verifyArtifactBytes(new Uint8Array(), expected)).toThrowError(expect.objectContaining({ code: "HASH_MISMATCH" }));
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    expect(() => verifyArtifactBytes(oversized, expected)).toThrowError(expect.objectContaining({ code: "SIZE_LIMIT" }));
    const invalidUtf8 = Uint8Array.from([0xc3, 0x28]);
    const invalidDigest = computeSha256(invalidUtf8);
    expect(() => verifyArtifactBytes(invalidUtf8, invalidDigest)).toThrowError(expect.objectContaining({ code: "INVALID_ARTIFACT" }));
  });
});
