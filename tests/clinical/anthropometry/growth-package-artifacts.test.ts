import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import { computeSha256 } from "../../../src/clinical/governance/checksum.ts";
import {
  GROWTH_PACKAGE_SCHEMA_VERSION,
  getGrowthPackageArtifact,
  type GrowthPackageCountry,
} from "../../../src/clinical/anthropometry/packages/growth-package-artifacts.ts";

const EXPECTED_DATASET_DIGESTS = Object.freeze({
  WHO_2006: "ae46179c20aa021b3dd7b6aa2758b8afc520c7cfa330eedaf67381bb58b84568",
  CDC_2000: "199a80e8628e97be7cb83188ad41e2e700938d21083ebeae4a3c5ea8bf0e1759",
  CDC_2022_EXTENDED_BMI: "79f7619e34b453134645b41d395092ec8db7657914fd54b304f66a8de0db6357",
} as const);

const EMPTY_FILE_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const FORBIDDEN_EXAMPLE_DIGESTS = new Set([
  "0".repeat(64),
  "1".repeat(64),
  "2".repeat(64),
  "3".repeat(64),
  EMPTY_FILE_SHA256,
]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function digestJson(path: string): Promise<string> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  return sha256(canonicalize(value));
}

function allDigests(value: unknown, output: string[] = []): readonly string[] {
  if (typeof value === "string" && /^[a-f0-9]{64}$/u.test(value)) output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allDigests(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => allDigests(item, output));
  return output;
}

describe("governed growth package artifacts", () => {
  it.each([
    ["CO", "growth-co-who-v1", "es-CO", ["WHO_2006"]],
    ["US", "growth-us-who-cdc-v1", "en-US", ["WHO_2006", "CDC_2000", "CDC_2022_EXTENDED_BMI"]],
  ] as const)("parses the exact %s package without country fallback", (country, packageKey, locale, datasets) => {
    const resolved = getGrowthPackageArtifact(country);

    expect(GROWTH_PACKAGE_SCHEMA_VERSION).toBe("1");
    expect(resolved.artifact.header).toMatchObject({
      schemaVersion: "1",
      domain: "growth",
      countryCode: country,
      locale,
      payloadSchema: "growth-package.v1",
    });
    expect(resolved.artifact.payload).toMatchObject({
      packageKey,
      countryCode: country,
      locale,
      prematurityPolicy: "rule_unavailable",
    });
    const datasetDigests = resolved.artifact.payload.datasetDigests as Readonly<Partial<Record<(typeof datasets)[number], string>>>;
    expect(Object.keys(datasetDigests).sort()).toEqual([...datasets].sort());
    for (const dataset of datasets) {
      expect(datasetDigests[dataset]).toBe(EXPECTED_DATASET_DIGESTS[dataset]);
    }
    expect(computeSha256(resolved.bytes)).toBe(resolved.artifactSha256);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.artifact.payload)).toBe(true);
  });

  it("recomputes every repository-byte digest independently", async () => {
    const whoBytes = await readFile("src/clinical/anthropometry/data/who/normalized-v1.json");
    const cdcBytes = await readFile("src/clinical/anthropometry/data/cdc/normalized-v1.json");
    const whoManifestSha256 = await digestJson("src/clinical/anthropometry/data/who/manifest.json");
    const cdcManifestSha256 = await digestJson("src/clinical/anthropometry/data/cdc/manifest.json");
    const fixtureManifest = JSON.parse(await readFile("tests/fixtures/growth/reproducibility-manifest.json", "utf8")) as { criticalCases: unknown };
    const fixtureSha256 = sha256(canonicalize(fixtureManifest));
    const approvalRecord = await readFile("docs/clinical/approval-record-2026-09-02-growth.md", "utf8");

    expect(sha256(whoBytes)).toBe(EXPECTED_DATASET_DIGESTS.WHO_2006);
    expect(sha256(cdcBytes)).toBe(EXPECTED_DATASET_DIGESTS.CDC_2000);

    for (const country of ["CO", "US"] satisfies readonly GrowthPackageCountry[]) {
      const resolved = getGrowthPackageArtifact(country);
      expect(resolved.evidence).toMatchObject({
        fixtureSha256,
        conveyanceRecordSha256: sha256(approvalRecord),
      });
      expect(resolved.evidence.manifestSha256).toBe(sha256(canonicalize({
        cdc: country === "US" ? cdcManifestSha256 : null,
        who: whoManifestSha256,
      })));
      expect(resolved.evidence.copySha256).toBe(sha256(canonicalize(resolved.artifact.payload.copy)));
      const sourceSet = resolved.artifact.header.sourceReferences
        .map((source) => ({ id: source.sourceId, artifactSha256: source.artifactSha256, status: "approved" }))
        .sort((left, right) => left.artifactSha256.localeCompare(right.artifactSha256));
      expect(resolved.evidence.sourceSetSha256).toBe(sha256(canonicalize(sourceSet)));
      const algorithmFiles = await Promise.all(resolved.artifact.payload.algorithmFiles.map(async (file) => ({
        path: file.path,
        sha256: sha256(await readFile(file.path)),
      })));
      expect(algorithmFiles).toEqual(resolved.artifact.payload.algorithmFiles);
      expect(resolved.evidence.algorithmImplementationSha256).toBe(sha256(canonicalize(algorithmFiles)));
      expect(resolved.evidence.algorithmTestVectorSha256).toBe(sha256(canonicalize(fixtureManifest.criticalCases)));
    }
  });

  it("rejects example, sequential, and empty-file digests as evidence", () => {
    for (const country of ["CO", "US"] satisfies readonly GrowthPackageCountry[]) {
      const resolved = getGrowthPackageArtifact(country);
      for (const digest of allDigests(resolved)) expect(FORBIDDEN_EXAMPLE_DIGESTS).not.toContain(digest);
    }
  });

  it("throws instead of selecting the nearest package", () => {
    expect(() => getGrowthPackageArtifact("GLOBAL" as GrowthPackageCountry)).toThrow("GROWTH_PACKAGE_UNAVAILABLE");
  });
});
