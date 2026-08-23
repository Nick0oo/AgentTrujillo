import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { canonicalize } from "json-canonicalize";

import {
  CONVEYED_APPROVAL_RECORD_SHA256,
  computeDevelopmentFrameworkArtifactSha256,
  resolveDevelopmentFramework,
  type DevelopmentFrameworkCandidate,
} from "../../../src/clinical/development/framework-resolver.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";

const SOURCE_ARTIFACT_DIGEST = "a".repeat(64) as Sha256Hex;
const FIXTURE_DIGEST = "b".repeat(64) as Sha256Hex;
const RIGHTS_DIGEST = "c".repeat(64) as Sha256Hex;
const APPROVAL_DIGEST = "d".repeat(64) as Sha256Hex;

const source = {
  sourceId: "synthetic-caregiver-source",
  sourceUri: "https://example.invalid/development/caregiver",
  sourceVersion: "2026.1",
  artifactSha256: SOURCE_ARTIFACT_DIGEST,
  license: "synthetic-caregiver-license",
  retrievedAt: "2026-08-20T12:00:00.000Z",
};

function sha256(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

const frameworkProvenance = {
  packageId: "development-co-caregiver",
  packageVersion: "1.0.0",
  algorithmVersion: "development-framework.v1",
  fixturesSha256: FIXTURE_DIGEST,
  rightsSha256: RIGHTS_DIGEST,
  jurisdiction: "CO" as const,
  locale: "es-CO",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  translation: "original" as const,
  artifactSha256: "0".repeat(64) as Sha256Hex,
  approvalDigest: APPROVAL_DIGEST,
  sources: [source],
};

const frameworkWithoutArtifact = {
  kind: "caregiver_education" as const,
  audience: "caregiver" as const,
  id: "development-co-caregiver",
  version: "1.0.0",
  items: [{
    id: "reaches-for-toy",
    domain: "gross_motor" as const,
    title: "Reaches toward a toy",
    caregiverCopy: "You may notice the child reaching toward an interesting toy.",
    minAgeDays: 120,
    maxAgeDays: 240,
    provenance: frameworkProvenance,
  }],
  provenance: frameworkProvenance,
  disclaimer: "Communication aid only; not a developmental standard, screening tool, diagnostic tool, or proof of normality.",
};

const FRAMEWORK_ARTIFACT_DIGEST = computeDevelopmentFrameworkArtifactSha256(frameworkWithoutArtifact);
const framework = {
  ...frameworkWithoutArtifact,
  provenance: { ...frameworkProvenance, artifactSha256: FRAMEWORK_ARTIFACT_DIGEST },
  items: frameworkWithoutArtifact.items.map((item) => ({ ...item, provenance: { ...frameworkProvenance, artifactSha256: FRAMEWORK_ARTIFACT_DIGEST } })),
};

function candidate(): DevelopmentFrameworkCandidate {
  const packageDigest = sha256({
    packageId: framework.provenance.packageId,
    packageVersion: framework.provenance.packageVersion,
    jurisdiction: framework.provenance.jurisdiction,
    locale: framework.provenance.locale,
    effectiveFrom: framework.provenance.effectiveFrom,
    effectiveUntil: framework.provenance.effectiveUntil,
  });
  const sourceDigest = sha256([{
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    sourceUri: source.sourceUri,
    artifactSha256: source.artifactSha256,
    license: source.license,
  }]);
  return {
    framework,
    release: {
      jurisdiction: "CO",
      locale: "es-CO",
      version: "1.0.0",
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
      status: "released",
      current: true,
      revoked: false,
    },
    approval: {
      status: "approved",
      current: true,
      digest: APPROVAL_DIGEST,
      recordDigest: CONVEYED_APPROVAL_RECORD_SHA256,
      approvedArtifactSha256: FRAMEWORK_ARTIFACT_DIGEST,
      packageId: framework.provenance.packageId,
      packageVersion: framework.provenance.packageVersion,
    },
    evidence: {
      packageDigest,
      sourceDigest,
      licenseDigest: sha256([source.license]),
      artifactDigest: framework.provenance.artifactSha256,
      algorithmDigest: sha256({ algorithmVersion: framework.provenance.algorithmVersion }),
      fixtureDigest: FIXTURE_DIGEST,
      rightsDigest: RIGHTS_DIGEST,
      disclaimerDigest: sha256(framework.disclaimer),
    },
  };
}

function unavailable(result: ReturnType<typeof resolveDevelopmentFramework>, reason: string) {
  expect(result).toMatchObject({ ok: false, code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE", reason });
  if (result.ok) return;
  expect(result).not.toHaveProperty("value");
  expect(result.digest).toMatch(/^[0-9a-f]{64}$/);
}

function candidateWithId(id: string): DevelopmentFrameworkCandidate {
  const base = candidate();
  const baseFramework = base.framework as Extract<typeof base.framework, { audience: "caregiver" }>;
  const nextFrameworkIdentity = {
    ...baseFramework,
    id,
    provenance: { ...baseFramework.provenance, packageId: id },
    items: baseFramework.items.map((item) => ({ ...item, provenance: { ...item.provenance, packageId: id } })),
  };
  const nextArtifactDigest = computeDevelopmentFrameworkArtifactSha256(nextFrameworkIdentity);
  const nextFramework = {
    ...nextFrameworkIdentity,
    provenance: { ...nextFrameworkIdentity.provenance, artifactSha256: nextArtifactDigest },
    items: nextFrameworkIdentity.items.map((item) => ({ ...item, provenance: { ...item.provenance, packageId: id, artifactSha256: nextArtifactDigest } })),
  };
  return {
    ...base,
    framework: nextFramework,
    approval: { ...base.approval, packageId: id, approvedArtifactSha256: nextArtifactDigest },
    evidence: {
      ...base.evidence,
      packageDigest: sha256({
        packageId: id,
        packageVersion: nextFramework.provenance.packageVersion,
        jurisdiction: nextFramework.provenance.jurisdiction,
        locale: nextFramework.provenance.locale,
        effectiveFrom: nextFramework.provenance.effectiveFrom,
        effectiveUntil: nextFramework.provenance.effectiveUntil,
      }),
      artifactDigest: nextArtifactDigest,
    },
  };
}

type TestCaregiverFramework = Extract<DevelopmentFrameworkCandidate["framework"], { audience: "caregiver" }>;
type TestMilestone = TestCaregiverFramework["items"][number];

function candidateWithItems(items: readonly TestMilestone[]): DevelopmentFrameworkCandidate {
  const base = candidate();
  const caregiver = base.framework as TestCaregiverFramework;
  const placeholder = "0".repeat(64) as Sha256Hex;
  const identity = {
    ...caregiver,
    provenance: { ...caregiver.provenance, artifactSha256: placeholder },
    items: items.map((item) => ({ ...item, provenance: { ...item.provenance, artifactSha256: placeholder } })),
  };
  const artifactDigest = computeDevelopmentFrameworkArtifactSha256(identity);
  const framework = {
    ...identity,
    provenance: { ...identity.provenance, artifactSha256: artifactDigest },
    items: identity.items.map((item) => ({ ...item, provenance: { ...item.provenance, artifactSha256: artifactDigest } })),
  };
  return { ...base, framework, evidence: { ...base.evidence, artifactDigest } };
}

describe("caregiver development framework resolver", () => {
  it("resolves one current, rights-cleared caregiver framework from trusted context", () => {
    const result = resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [candidate()],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      audience: "caregiver",
      version: "1.0.0",
      sourceDigest: expect.any(String),
      licenseDigest: expect.any(String),
      approvalDigest: APPROVAL_DIGEST,
      approvalRecordDigest: CONVEYED_APPROVAL_RECORD_SHA256,
      framework,
    });
    expect(result.value.sourceDigests).toEqual([SOURCE_ARTIFACT_DIGEST]);
    expect(result.value.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["draft", { release: { ...candidate().release, status: "draft" as const } }, "NOT_RELEASED"],
    ["retired", { release: { ...candidate().release, status: "retired" as const } }, "NOT_RELEASED"],
    ["revoked", { release: { ...candidate().release, status: "revoked" as const, revoked: true } }, "REVOKED"],
    ["stale release", { release: { ...candidate().release, current: false } }, "NOT_CURRENT"],
    ["withdrawn approval", { approval: { ...candidate().approval, status: "withdrawn" as const } }, "APPROVAL_UNAVAILABLE"],
    ["stale approval", { approval: { ...candidate().approval, current: false } }, "APPROVAL_UNAVAILABLE"],
    ["artifact checksum drift", { evidence: { ...candidate().evidence, artifactDigest: FIXTURE_DIGEST } }, "CHECKSUM_MISMATCH"],
    ["rights evidence drift", { evidence: { ...candidate().evidence, rightsDigest: SOURCE_ARTIFACT_DIGEST } }, "CHECKSUM_MISMATCH"],
    ["disclaimer drift", { framework: { ...candidate().framework, disclaimer: "This is a developmental standard." } }, "DISCLAIMER_DRIFT"],
    ["locale mismatch", { release: { ...candidate().release, locale: "en-US" } }, "LOCALE_MISMATCH"],
    ["country mismatch", { release: { ...candidate().release, jurisdiction: "US" as const } }, "JURISDICTION_MISMATCH"],
  ] as const)("fails closed for %s", (_label, overrides, reason) => {
    const base = candidate();
    const result = resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [{ ...base, ...overrides }],
    );
    unavailable(result, reason);
  });

  it("does not expose a professional instrument, including EAD-3, to consumer resolution", () => {
    const base = candidate();
    const professional = {
      ...base,
      framework: {
        kind: "professional_instrument_reference" as const,
        audience: "professional" as const,
        identifier: "EAD-3",
        version: "3.0.0",
        rights: { license: "synthetic-professional-license", artifactSha256: SOURCE_ARTIFACT_DIGEST, rightsSha256: RIGHTS_DIGEST },
        governance: { sourceId: "professional-source", sourceDigest: SOURCE_ARTIFACT_DIGEST, approvalDigest: APPROVAL_DIGEST },
      },
    };

    const result = resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [professional],
    );
    unavailable(result, "PROFESSIONAL_ONLY");
    expect(result).not.toHaveProperty("framework");
    expect(result).not.toHaveProperty("items");
    expect(result).not.toHaveProperty("prompts");
    expect(result).not.toHaveProperty("scoring");
    expect(result).not.toHaveProperty("cutoffs");
    expect(result).not.toHaveProperty("results");

    const disguised = candidateWithId("ead3-caregiver");
    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [disguised],
    ), "PROFESSIONAL_ONLY");
  });

  it.each([
    ["id", "ead3-item"],
    ["title", "A scoring cutoff"],
    ["title", "Examiner classification"],
    ["caregiverCopy", "This indicates diagnosis, delay, or autism."],
    ["caregiverCopy", "This is normal, abnormal, pass, or fail."],
    ["caregiverCopy", "This is professional-instrument content."],
  ] as const)("rejects consumer item %s containing the marker %s", (field, marker) => {
    const base = candidate();
    const caregiver = base.framework as TestCaregiverFramework;
    const item = { ...caregiver.items[0], [field]: marker };
    const result = resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [candidateWithItems([item])],
    );
    unavailable(result, "PROFESSIONAL_ONLY");
  });

  it("rejects one-field title or caregiver-copy mutation without updated artifact metadata", () => {
    const base = candidate();
    const caregiver = base.framework as TestCaregiverFramework;
    for (const field of ["title", "caregiverCopy"] as const) {
      const item = { ...caregiver.items[0], [field]: `${caregiver.items[0][field]} changed` };
      const result = resolveDevelopmentFramework(
        { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
        [{ ...base, framework: { ...caregiver, items: [item] } }],
      );
      unavailable(result, "CHECKSUM_MISMATCH");
    }
  });

  it("requires approval attestation for the exact current artifact", () => {
    const base = candidate();
    const caregiver = base.framework as TestCaregiverFramework;
    const mutated = candidateWithItems([{ ...caregiver.items[0], title: "A changed synthetic title" }]);

    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [mutated],
    ), "APPROVAL_UNAVAILABLE");

    const mutatedFramework = mutated.framework as TestCaregiverFramework;
    const reapproved = {
      ...mutated,
      approval: {
        ...mutated.approval,
        approvedArtifactSha256: mutatedFramework.provenance.artifactSha256,
      },
    };
    expect(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [reapproved],
    ).ok).toBe(true);
  });

  it("rejects professional markers in source provenance without exposing content", () => {
    const base = candidate();
    const caregiver = base.framework as TestCaregiverFramework;
    const marked = {
      ...base,
      framework: {
        ...caregiver,
        provenance: {
          ...caregiver.provenance,
          sources: [{ ...source, sourceUri: "https://example.invalid/reference/ead-3" }],
        },
      },
    };

    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [marked],
    ), "PROFESSIONAL_ONLY");
  });

  it("rejects caregiver frameworks whose item provenance comes from another package or jurisdiction", () => {
    const base = candidate();
    const caregiver = base.framework as Extract<typeof base.framework, { audience: "caregiver" }>;
    const foreignItem = {
      id: "foreign-item",
      domain: "gross_motor" as const,
      title: "A synthetic foreign item",
      caregiverCopy: "A synthetic foreign communication aid.",
      minAgeDays: 1,
      maxAgeDays: 2,
      provenance: {
        ...caregiver.provenance,
        packageId: "development-us-caregiver",
        jurisdiction: "US" as const,
        locale: "en-US",
      },
    };
    const mixed = candidateWithItems([foreignItem]);

    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [mixed],
    ), "CHECKSUM_MISMATCH");
  });

  it("rejects duplicate caregiver milestone IDs", () => {
    const base = candidate();
    const caregiver = base.framework as Extract<typeof base.framework, { audience: "caregiver" }>;
    const item = {
      id: "same-item",
      domain: "gross_motor" as const,
      title: "A synthetic item",
      caregiverCopy: "A synthetic communication aid.",
      minAgeDays: 1,
      maxAgeDays: 2,
      provenance: caregiver.provenance,
    };
    const duplicate = candidateWithItems([item, { ...item, title: "A second copy" }]);

    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [duplicate],
    ), "CHECKSUM_MISMATCH");
  });

  it("rejects GLOBAL instead of accepting self-declared policy tokens", () => {
    const base = candidate();
    const caregiver = base.framework as TestCaregiverFramework;
    const global = {
    ...base,
    framework: {
      ...caregiver,
      provenance: { ...caregiver.provenance, jurisdiction: "GLOBAL" as const },
      items: caregiver.items.map((item) => ({ ...item, provenance: { ...item.provenance, jurisdiction: "GLOBAL" as const } })),
    },
      release: { ...base.release, jurisdiction: "GLOBAL" as const },
    } as unknown as DevelopmentFrameworkCandidate;
    unavailable(resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf: "2026-08-22" },
      [global],
    ), "JURISDICTION_MISMATCH");
  });

  it.each([
    "2026-02-30",
    Symbol("invalid-as-of"),
    1n,
  ] as const)("returns deterministic INVALID_CONTEXT for malformed asOf %s", (asOf) => {
    const result = resolveDevelopmentFramework(
      { countryOfCare: "CO", locale: "es-CO", asOf } as never,
      [candidate()],
    );
    unavailable(result, "INVALID_CONTEXT");
  });

  it("uses exact effective/locale selection and stable ambiguity digests", () => {
    const context = { countryOfCare: "CO" as const, locale: "es-CO", asOf: "2026-08-22T04:59:59.000Z", timeZone: "America/Bogota" };
    expect(resolveDevelopmentFramework(context, [candidate()]).ok).toBe(true);
    unavailable(resolveDevelopmentFramework({ ...context, locale: "en-US" }, [candidate()]), "LOCALE_MISMATCH");

    const left = resolveDevelopmentFramework(context, [candidate(), candidateWithId("development-co-caregiver-2")]);
    const right = resolveDevelopmentFramework(context, [candidateWithId("development-co-caregiver-2"), candidate()]);
    expect(left).toMatchObject({ ok: false, reason: "AMBIGUOUS_CANDIDATE" });
    expect(right).toEqual(left);
  });
});
