import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { canonicalizeRulePackArtifact } from "../../../src/clinical/governance/canonicalize-artifact";
import { verifyArtifactBytes } from "../../../src/clinical/governance/checksum";
import { clinicalArtifactPath } from "../../../src/clinical/governance/artifact-store";
import { createClinicalArtifactStore } from "../../../src/persistence/supabase/clinical-artifact-store";
import type { RulePackArtifactV1 } from "../../../src/clinical/governance/artifact-types";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types";
import type { PrivilegedJobScope } from "../../../agent/lib/supabase/privileged-job-scope";

const digest = "a".repeat(64) as Sha256Hex;
const artifact: RulePackArtifactV1 = {
  schemaVersion: "1", header: { schemaVersion: "1", domain: "immunization", countryCode: "CO", locale: "es-CO", version: "1.0.0",
    effectiveFrom: "2026-01-01", effectiveUntil: null, algorithm: { key: "fixture", version: "1.0.0", implementationSha256: digest, supportedSchemaVersion: "1" },
    sourceReferences: [{ sourceId: "a", purpose: "normative", artifactSha256: digest }], payloadSchema: "fixture.v1" }, payload: { rule: "fixture" }, fixtures: [],
};
const bytes = canonicalizeRulePackArtifact(artifact);
const actualDigest = createHash("sha256").update(bytes).digest("hex");
const verified = verifyArtifactBytes(bytes, actualDigest);

function scope(overrides: Partial<PrivilegedJobScope> = {}): PrivilegedJobScope {
  return { jobName: "clinical-artifact-storage", invocationId: "fixture", allowedOperations: ["maintenance:retention"], issuedAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000), ...overrides } as PrivilegedJobScope;
}

function fakeClient() {
  let stored = bytes;
  const upload = vi.fn<(path: string, body: Uint8Array, options: unknown) => Promise<{ data: { path: string } | null; error: unknown | null }>>(async (path) => ({ data: { path }, error: null }));
  const download = vi.fn<() => Promise<{ data: Blob | null; error: unknown | null }>>(async () => ({ data: new Blob([Buffer.from(stored)]), error: null }));
  return { storage: { from: vi.fn(() => ({ upload, download })) }, upload, download, setBytes(value: Uint8Array) { stored = value; } };
}

describe("private clinical artifact storage", () => {
  it("builds deterministic content-addressed paths and uploads with immutable JSON headers", async () => {
    expect(clinicalArtifactPath("immunization", "CO", digest)).toBe(`v1/immunization/CO/${digest}.json`);
    const client = fakeClient();
    const location = await createClinicalArtifactStore(client as never).putVerifiedArtifact(scope(), verified);
    expect(location.path).toBe(`v1/immunization/CO/${verified.digest}.json`);
    expect(client.upload).toHaveBeenCalledWith(location.path, bytes, { contentType: "application/json", cacheControl: "31536000, immutable", upsert: false });
    expect(client.download).toHaveBeenCalledTimes(1);
  });

  it("accepts identical replay and rejects conflicts/corruption/missing objects", async () => {
    const client = fakeClient();
    client.upload.mockResolvedValueOnce({ data: null, error: { statusCode: 409, message: "already exists" } });
    const store = createClinicalArtifactStore(client as never);
    await expect(store.putVerifiedArtifact(scope(), verified)).resolves.toMatchObject({ artifactSha256: verified.digest });
    client.upload.mockResolvedValueOnce({ data: null, error: { statusCode: 409, message: "already exists" } });
    client.setBytes(Uint8Array.from([1, 2, 3]));
    await expect(store.putVerifiedArtifact(scope(), verified)).rejects.toMatchObject({ code: "OBJECT_CONFLICT" });
    client.download.mockResolvedValueOnce({ data: null, error: { statusCode: 404 } });
    await expect(store.getVerifiedArtifact(scope(), { bucket: "clinical-sources", path: `v1/immunization/CO/${verified.digest}.json`, artifactSha256: verified.digest }, verified.digest)).rejects.toMatchObject({ code: "OBJECT_MISSING" });
  });

  it("rejects wrong scope, forged location, oversize/cancelled reads, and never exposes generic storage", async () => {
    const client = fakeClient();
    const store = createClinicalArtifactStore(client as never);
    await expect(store.putVerifiedArtifact(scope({ jobName: "wrong" }), verified)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    await expect(store.getVerifiedArtifact(scope(), { bucket: "clinical-sources", path: "v1/immunization/CO/other.json", artifactSha256: verified.digest } as never, verified.digest)).rejects.toMatchObject({ code: "CONTENT_INVALID" });
    await expect(store.getVerifiedArtifact(scope(), { bucket: "clinical-sources", path: `v1/immunization/CO/${verified.digest}.json`, artifactSha256: verified.digest }, verified.digest, AbortSignal.abort())).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(Object.keys(store)).toEqual(["putVerifiedArtifact", "getVerifiedArtifact"]);
  });
});
