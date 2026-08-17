import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalize } from "json-canonicalize";

import { createClinicalPackageRepository } from "../../src/persistence/supabase/clinical-package-repository.ts";

const artifactSha256 = "a".repeat(64);
const sourceArtifactSha256 = "b".repeat(64);
const sourceSetSha256 = createHash("sha256").update(canonicalize([{ id: "source-1", artifactSha256: sourceArtifactSha256, status: "approved" }])).digest("hex");

function queryFor(value: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: value, error: null }).then(resolve),
  };
  return builder;
}

describe("Supabase clinical package repository", () => {
  it("joins only an active, released, approved, source-complete package", async () => {
    const pack = {
      id: "pack-1", domain: "immunization", country_code: "CO", version: "2026.1", locale: "es-CO", status: "active",
      effective_from: "2026-01-01", effective_until: null, artifact_sha256: artifactSha256, artifact_uri: null,
    };
    const source = {
      id: "source-1", authority: "MINSALUD_PAI", jurisdiction: "CO", title: "PAI", source_uri: "https://www.minsalud.gov.co/pai",
      citation: null, published_at: "2026-01-01", retrieved_at: "2026-08-15T00:00:00.000Z", effective_from: "2026-01-01", effective_until: null,
      license: "official", artifact_sha256: sourceArtifactSha256, status: "approved",
    };
    const link = { rule_pack_id: "pack-1", source_id: "source-1", purpose: "normative" };
    const release = { id: "release-1", rule_pack_id: "pack-1", artifact_sha256: artifactSha256, algorithm_id: "algorithm-1", approval_id: "approval-1", domain: "immunization", country_code: "CO", locale: "es-CO", action: "release", status: "active", activation_at: "2026-08-15T00:00:00.000Z", previous_release_id: null, evidence_sha256: "c".repeat(64), preview_sha256: "d".repeat(64), requester_subject: "00000000-0000-4000-8000-000000000001", request_id: "00000000-0000-4000-8000-000000000002", created_at: "2026-08-15T00:00:00.000Z" };
    const algorithm = { id: "algorithm-1", algorithm_key: "immunization-v1", version: "1.0.0", domain: "immunization", implementation_sha256: "e".repeat(64), test_vector_sha256: "f".repeat(64), artifact_schema_versions: ["v1"], entrypoint: "immunization", runtime: "node24", status: "active" };
    const approval = { id: "approval-1", rule_pack_id: "pack-1", artifact_sha256: artifactSha256, algorithm_id: "algorithm-1", algorithm_implementation_sha256: algorithm.implementation_sha256, source_set_sha256: sourceSetSha256, manifest_sha256: "1".repeat(64), approver_subject: "00000000-0000-4000-8000-000000000003", approver_role: "clinical_approver", decision: "approved", decided_at: "2026-08-15T00:00:00.000Z", request_id: "00000000-0000-4000-8000-000000000004", withdrawal_of: null };
    const values: Record<string, unknown> = {
      clinical_rule_packs: [pack], clinical_rule_pack_sources: [link], clinical_sources: [source],
      clinical_package_releases: [release], clinical_algorithms: [algorithm], clinical_approvals: [approval],
    };
    const repository = createClinicalPackageRepository({ from: (table: string) => queryFor(values[table]) } as never);

    const result = await repository.findCandidates({ domain: "immunization", countryCode: "CO", locale: "es-CO", referenceDate: "2026-08-16", artifactSchemaVersion: "v1" });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ pack: { id: "pack-1", countryCode: "CO" }, sourceSetSha256, approval: { decision: "approved", algorithmId: "immunization-v1" }, release: { status: "active" } });
    expect(result[0].location.path).toBe(`v1/immunization/CO/${artifactSha256}.json`);
  });

  it("returns no candidate when an official source has no immutable artifact digest", async () => {
    const values: Record<string, unknown> = {
      clinical_rule_packs: [{ id: "pack-1", domain: "immunization", country_code: "US", version: "2025", locale: "en-US", status: "active", effective_from: "2025-01-01", effective_until: null, artifact_sha256: artifactSha256 }],
      clinical_rule_pack_sources: [{ rule_pack_id: "pack-1", source_id: "source-1", purpose: "normative" }],
      clinical_sources: [{ id: "source-1", authority: "CDC_ACIP", jurisdiction: "US", title: "CDC", source_uri: "https://www.cdc.gov/schedule", citation: null, published_at: "2025-01-01", retrieved_at: "2026-08-15T00:00:00.000Z", effective_from: null, effective_until: null, license: "official", artifact_sha256: null, status: "approved" }],
      clinical_package_releases: [], clinical_algorithms: [], clinical_approvals: [],
    };
    const repository = createClinicalPackageRepository({ from: (table: string) => queryFor(values[table]) } as never);
    await expect(repository.findCandidates({ domain: "immunization", countryCode: "US", locale: "en-US", referenceDate: "2026-08-16", artifactSchemaVersion: "v1" })).resolves.toEqual([]);
  });
});
