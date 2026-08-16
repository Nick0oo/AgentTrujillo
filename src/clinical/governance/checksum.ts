import { createHash, timingSafeEqual } from "node:crypto";

import { DEFAULT_ARTIFACT_LIMITS } from "./artifact-schema.ts";
import { canonicalizeRulePackArtifact, parseRulePackArtifact, ArtifactParseError } from "./canonicalize-artifact.ts";
import type { ArtifactLimits, RulePackArtifactV1 } from "./artifact-types.ts";
import type { Sha256Hex } from "./source-types.ts";

export type ChecksumErrorCode =
  | "INVALID_DIGEST"
  | "SIZE_LIMIT"
  | "HASH_MISMATCH"
  | "NON_CANONICAL_ARTIFACT"
  | "INVALID_ARTIFACT"
  | "CANCELLED";

export class ChecksumError extends Error {
  readonly code: ChecksumErrorCode;

  constructor(code: ChecksumErrorCode) {
    super(code);
    this.name = "ChecksumError";
    this.code = code;
  }
}

export type VerifyStreamLimits = Readonly<{
  maxBytes?: number;
  signal?: AbortSignal;
}>;

function asBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new ChecksumError("INVALID_ARTIFACT");
  return bytes;
}

function parseExpectedDigest(expected: string): Buffer {
  if (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected)) throw new ChecksumError("INVALID_DIGEST");
  return Buffer.from(expected, "hex");
}

function compareDigest(actual: Buffer, expected: string): Sha256Hex {
  const expectedBytes = parseExpectedDigest(expected);
  if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) throw new ChecksumError("HASH_MISMATCH");
  return expected as Sha256Hex;
}

export function computeSha256(bytes: Uint8Array): Sha256Hex {
  return createHash("sha256").update(asBytes(bytes)).digest("hex") as Sha256Hex;
}

function parseAndVerify<T>(bytes: Uint8Array, digest: Sha256Hex): VerifiedRulePackArtifact<T> {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ChecksumError("INVALID_ARTIFACT");
  }
  let parsed: RulePackArtifactV1<T>;
  try {
    parsed = parseRulePackArtifact<T>(text);
  } catch (error) {
    if (error instanceof ArtifactParseError) throw new ChecksumError("INVALID_ARTIFACT");
    throw new ChecksumError("INVALID_ARTIFACT");
  }
  let canonical: Uint8Array;
  try {
    canonical = canonicalizeRulePackArtifact(parsed);
  } catch {
    throw new ChecksumError("INVALID_ARTIFACT");
  }
  if (canonical.byteLength !== bytes.byteLength || !Buffer.from(canonical).equals(Buffer.from(bytes))) {
    throw new ChecksumError("NON_CANONICAL_ARTIFACT");
  }
  return { bytes, digest, artifact: parsed } as VerifiedRulePackArtifact<T>;
}

export function verifyArtifactBytes<T = unknown>(bytes: Uint8Array, expected: string): VerifiedRulePackArtifact<T> {
  const received = asBytes(bytes);
  if (received.byteLength > DEFAULT_ARTIFACT_LIMITS.maxBytes) throw new ChecksumError("SIZE_LIMIT");
  const digest = compareDigest(Buffer.from(computeSha256(received), "hex"), expected);
  return parseAndVerify(received, digest);
}

export async function verifyArtifactStream<T = unknown>(
  stream: AsyncIterable<Uint8Array>,
  expected: string,
  limits: VerifyStreamLimits = {},
): Promise<VerifiedRulePackArtifact<T>> {
  const maxBytes = Math.min(limits.maxBytes ?? DEFAULT_ARTIFACT_LIMITS.maxBytes, DEFAULT_ARTIFACT_LIMITS.maxBytes);
  parseExpectedDigest(expected);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of stream) {
      if (limits.signal?.aborted) throw new ChecksumError("CANCELLED");
      const bytes = asBytes(chunk);
      total += bytes.byteLength;
      if (total > maxBytes) throw new ChecksumError("SIZE_LIMIT");
      hash.update(bytes);
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof ChecksumError) throw error;
    throw new ChecksumError("INVALID_ARTIFACT");
  }
  if (limits.signal?.aborted) throw new ChecksumError("CANCELLED");
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  const digest = compareDigest(hash.digest(), expected);
  return parseAndVerify(bytes, digest);
}

export type VerifiedRulePackArtifact<T = unknown> = Readonly<{
  bytes: Uint8Array;
  digest: Sha256Hex;
  artifact: RulePackArtifactV1<T>;
}> & { readonly __verifiedRulePackArtifact: unique symbol };
