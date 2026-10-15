import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canonicalize } from "json-canonicalize";

import { canonicalizeRulePackArtifact, parseRulePackArtifact } from "../../governance/canonicalize-artifact.ts";
import { computeSha256, verifyArtifactBytes } from "../../governance/checksum.ts";
import type { RulePackArtifactV1 } from "../../governance/artifact-types.ts";
import type { Sha256Hex } from "../../governance/source-types.ts";
import {
  GROWTH_PACKAGE_PAYLOAD_SCHEMA,
  type GrowthPackageCountry,
  type GrowthPackagePayload,
} from "./growth-package-schema.ts";

export { type GrowthPackageCountry, type GrowthPackagePayload } from "./growth-package-schema.ts";

export const GROWTH_PACKAGE_SCHEMA_VERSION = "1" as const;

const WHO_MANIFEST_SHA256 = "ea88db02eb2f7fe271957912026e95d33edd8ec50c9f5ba0a38976122f49df53";
const CDC_MANIFEST_SHA256 = "e4a0ba311daf4399d43d951862c7a7386f6269ba23c761e14a50e5911555c938";
const FIXTURE_SHA256 = "2d98d6e0dc0dd3930f799397d788977bd9f5b1103ee61ffa6fa229b6f9cd11a0";
const CONVEYANCE_RECORD_SHA256 = "30b6d302ac00b770a4d564994afb2c918803e34bc3d71408996d22ae20544089";
const ALGORITHM_TEST_VECTOR_SHA256 = "0f23f7f0f9c996ebea5a64459ee21aa9388ae46664c7992bbed939d69e619d43";

type GrowthPackageArtifact = RulePackArtifactV1<GrowthPackagePayload>;

export type GrowthPackageEvidence = Readonly<{
  sourceSetSha256: Sha256Hex;
  manifestSha256: Sha256Hex;
  copySha256: Sha256Hex;
  fixtureSha256: Sha256Hex;
  conveyanceRecordSha256: Sha256Hex;
  algorithmImplementationSha256: Sha256Hex;
  algorithmTestVectorSha256: Sha256Hex;
}>;

export type GrowthPackageArtifactIdentity = Readonly<{
  artifact: GrowthPackageArtifact;
  bytes: Uint8Array;
  artifactSha256: Sha256Hex;
  evidence: GrowthPackageEvidence;
}>;

function sha256(value: string): Sha256Hex {
  return createHash("sha256").update(value, "utf8").digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value as object)) return value;
  if (ArrayBuffer.isView(value)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function sourceSetSha256(artifact: GrowthPackageArtifact): Sha256Hex {
  const sources = artifact.header.sourceReferences
    .map((source) => ({ id: source.sourceId, artifactSha256: source.artifactSha256, status: "approved" }))
    .sort((left, right) => left.artifactSha256.localeCompare(right.artifactSha256));
  return sha256(canonicalize(sources));
}

function manifestSha256(country: GrowthPackageCountry): Sha256Hex {
  return sha256(canonicalize({
    cdc: country === "US" ? CDC_MANIFEST_SHA256 : null,
    who: WHO_MANIFEST_SHA256,
  }));
}

function loadArtifact(country: GrowthPackageCountry, fileName: string): GrowthPackageArtifactIdentity {
  const source = readFileSync(new URL(fileName, import.meta.url), "utf8");
  const parsed = parseRulePackArtifact(source);
  const payload = GROWTH_PACKAGE_PAYLOAD_SCHEMA.parse(parsed.payload);
  if (parsed.header.countryCode !== country || payload.countryCode !== country) throw new Error("GROWTH_PACKAGE_IDENTITY_MISMATCH");
  const artifact = { ...parsed, payload } as GrowthPackageArtifact;
  const bytes = canonicalizeRulePackArtifact(artifact);
  const artifactSha256 = computeSha256(bytes);
  const verified = verifyArtifactBytes<GrowthPackagePayload>(bytes, artifactSha256);
  const evidence: GrowthPackageEvidence = {
    sourceSetSha256: sourceSetSha256(artifact),
    manifestSha256: manifestSha256(country),
    copySha256: sha256(canonicalize(payload.copy)),
    fixtureSha256: FIXTURE_SHA256 as Sha256Hex,
    conveyanceRecordSha256: CONVEYANCE_RECORD_SHA256 as Sha256Hex,
    algorithmImplementationSha256: artifact.header.algorithm.implementationSha256,
    algorithmTestVectorSha256: ALGORITHM_TEST_VECTOR_SHA256 as Sha256Hex,
  };
  return deepFreeze({
    artifact: verified.artifact as GrowthPackageArtifact,
    bytes: verified.bytes,
    artifactSha256: verified.digest,
    evidence,
  });
}

const PACKAGES = Object.freeze({
  CO: loadArtifact("CO", "growth-co-who-v1.json"),
  US: loadArtifact("US", "growth-us-who-cdc-v1.json"),
});

export function getGrowthPackageArtifact(countryCode: GrowthPackageCountry): GrowthPackageArtifactIdentity {
  const artifact = PACKAGES[countryCode];
  if (!artifact) throw new Error("GROWTH_PACKAGE_UNAVAILABLE");
  return artifact;
}
