import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../agent/lib/access/authorized-child-scope.ts";
import { createDoseValidationRepository } from "../../src/clinical/medication/validation-repository.ts";

function scope() {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: "00000000-0000-4000-8000-000000000001",
    careSpaceId: "00000000-0000-4000-8000-000000000002",
    childId: "00000000-0000-4000-8000-000000000003",
    permissions: ["record"],
    countryOfCare: "CO",
    timezone: "UTC",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date(Date.now() - 60_000),
    expiresAt: new Date(Date.now() + 60_000),
  });
}

const write = {
  requestId: "medication-validation-1",
  declaredInput: { quantity: "1", unit: "mL" },
  outcome: "insufficient_data" as const,
  explanationCodes: ["RULE_UNAVAILABLE"],
  packageVersion: "unavailable",
  algorithmVersion: "medication-1",
  vocabularyVersion: "medication-1",
  artifactSha256: null,
  inputDigest: "a".repeat(64),
  decisionDigest: "b".repeat(64),
  sourceEvidence: [{ sourceId: "rxnorm", sourceVersion: "2026-08-21", sourceKind: "identity" as const, sourceUri: "https://www.nlm.nih.gov/research/umls/rxnorm/overview.html", artifactSha256: "c".repeat(64) }],
  ingredients: [],
};

describe("dose validation repository", () => {
  it("passes normalized source rows to the RPC", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: [{ validation_id: "00000000-0000-4000-8000-000000000099", outcome: "created" }], error: null }));
    const result = await createDoseValidationRepository({ rpc }).save(scope(), write);
    expect(result.outcome).toBe("created");
    expect(rpc.mock.calls[0]?.[1].p_source_evidence).toEqual(write.sourceEvidence);
  });

  it("rejects malformed or non-HTTPS source evidence before persistence", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
    const repository = createDoseValidationRepository({ rpc });
    await expect(repository.save(scope(), { ...write, sourceEvidence: [{ ...write.sourceEvidence[0]!, sourceUri: "http://invalid.test", artifactSha256: "invalid" }] } as never)).rejects.toThrow("MEDICATION_SOURCE_EVIDENCE_INVALID");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses reassuring or numeric outcomes until a governed medication package exists", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: null, error: null }));
    const repository = createDoseValidationRepository({ rpc });

    await expect(repository.save(scope(), { ...write, outcome: "within_reference_limits" })).rejects.toThrow("MEDICATION_GOVERNED_VALIDATION_UNAVAILABLE");
    await expect(repository.save(scope(), { ...write, outcome: "outside_reference_limits" })).rejects.toThrow("MEDICATION_GOVERNED_VALIDATION_UNAVAILABLE");
    await expect(repository.save(scope(), { ...write, packageVersion: "unapproved-package" })).rejects.toThrow("MEDICATION_GOVERNED_VALIDATION_UNAVAILABLE");
    await expect(repository.save(scope(), { ...write, artifactSha256: "d".repeat(64) })).rejects.toThrow("MEDICATION_GOVERNED_VALIDATION_UNAVAILABLE");

    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a numeric comparison only when exact governed package identity is present", async () => {
    const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: [{ validation_id: "00000000-0000-4000-8000-000000000098", outcome: "created" }], error: null }));
    const governed = {
      ...write,
      outcome: "within_reference_limits" as const,
      explanationCodes: ["DECLARED_DOSE_WITHIN_EXACT_REFERENCE"],
      packageVersion: "2026.basic.1",
      artifactSha256: "d".repeat(64),
    };
    await expect(createDoseValidationRepository({ rpc }).save(scope(), governed)).resolves.toMatchObject({ outcome: "created" });
    expect(rpc).toHaveBeenCalledOnce();
  });
});
