import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";
import { canonicalize } from "json-canonicalize";

import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  CONVEYED_APPROVAL_RECORD_SHA256,
  computeDevelopmentFrameworkArtifactSha256,
  resolveDevelopmentFramework,
  type DevelopmentFrameworkCandidate,
  type DevelopmentFrameworkResolution,
} from "../../../src/clinical/development/framework-resolver.ts";
import type { DevelopmentFramework, CaregiverMilestoneItem } from "../../../src/clinical/development/types.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";
import {
  CAREGIVER_MILESTONE_DISCLAIMER,
  createMilestoneQuery,
  type MilestoneAgeWindow,
  type MilestoneAgeEvidencePort,
  type MilestoneFrameworkResolver,
  type MilestoneQueryInput,
} from "../../../src/application/development/milestone-query.ts";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const SIBLING_ID = "00000000-0000-4000-8000-000000000004";
const OTHER_SPACE_ID = "00000000-0000-4000-8000-000000000005";
const CUTOFF = new Date("2026-08-22T12:00:00.000Z");
const CUTOFF_ISO = CUTOFF.toISOString();
const SOURCE_ARTIFACT_DIGEST = "a".repeat(64) as Sha256Hex;
const FIXTURE_DIGEST = "b".repeat(64) as Sha256Hex;
const RIGHTS_DIGEST = "c".repeat(64) as Sha256Hex;
const APPROVAL_DIGEST = "d".repeat(64) as Sha256Hex;
const AGE_SOURCE_DIGEST = "e".repeat(64) as Sha256Hex;
const AGE_POLICY_ARTIFACT_DIGEST = "f".repeat(64) as Sha256Hex;
const AGE_POLICY_APPROVAL_DIGEST = "1".repeat(64) as Sha256Hex;
const FRAMEWORK_ID = "development-co-caregiver";

const source = {
  sourceId: "synthetic-caregiver-source",
  sourceUri: "https://example.invalid/development/caregiver",
  sourceVersion: "2026.1",
  artifactSha256: SOURCE_ARTIFACT_DIGEST,
  license: "synthetic-caregiver-license",
  retrievedAt: "2026-08-20T12:00:00.000Z",
};

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

function scope(overrides: Partial<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly ("read" | "record" | "manage_documents" | "manage_medication" | "manage_guardians")[];
  countryOfCare: "CO" | "US";
  timezone: string;
  authorizationVersion: string;
  issuedAt: Date;
  expiresAt: Date;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: overrides.actorUserId ?? ACTOR_ID,
    careSpaceId: overrides.careSpaceId ?? SPACE_ID,
    childId: overrides.childId ?? CHILD_ID,
    permissions: overrides.permissions ?? ["read"],
    countryOfCare: overrides.countryOfCare ?? "CO",
    timezone: overrides.timezone ?? "America/Bogota",
    authorizationVersion: overrides.authorizationVersion ?? "m:1:a:1",
    issuedAt: overrides.issuedAt ?? new Date("2026-08-22T11:58:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-08-22T12:02:00.000Z"),
  });
}

function milestone(overrides: Partial<{
  id: string;
  domain: CaregiverMilestoneItem["domain"];
  title: string;
  caregiverCopy: string;
  minAgeDays: number;
  maxAgeDays: number | null;
}> = {}): Omit<CaregiverMilestoneItem, "provenance"> & { provenance?: never } {
  return {
    id: overrides.id ?? "communicates-with-gesture",
    domain: overrides.domain ?? "language",
    title: overrides.title ?? "Communicates with a gesture",
    caregiverCopy: overrides.caregiverCopy ?? "You may notice the child using a gesture to share an interest.",
    minAgeDays: overrides.minAgeDays ?? 120,
    maxAgeDays: overrides.maxAgeDays ?? 240,
  };
}

function framework(
  items: readonly ReturnType<typeof milestone>[],
  sources: readonly typeof source[] = [source],
): Extract<DevelopmentFramework, { audience: "caregiver" }> {
  const provenance = {
    packageId: FRAMEWORK_ID,
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
    sources,
  };
  const withoutArtifact = {
    kind: "caregiver_education" as const,
    audience: "caregiver" as const,
    id: FRAMEWORK_ID,
    version: "1.0.0",
    items: items.map((item) => ({ ...item, provenance })),
    provenance,
    disclaimer: CAREGIVER_MILESTONE_DISCLAIMER,
  };
  const artifactSha256 = computeDevelopmentFrameworkArtifactSha256(withoutArtifact);
  return {
    ...withoutArtifact,
    provenance: { ...provenance, artifactSha256 },
    items: withoutArtifact.items.map((item) => ({ ...item, provenance: { ...provenance, artifactSha256 } })),
  };
}

function candidate(frameworkValue = framework([milestone()])): DevelopmentFrameworkCandidate {
  const packageDigest = digest({
    packageId: frameworkValue.provenance.packageId,
    packageVersion: frameworkValue.provenance.packageVersion,
    jurisdiction: frameworkValue.provenance.jurisdiction,
    locale: frameworkValue.provenance.locale,
    effectiveFrom: frameworkValue.provenance.effectiveFrom,
    effectiveUntil: frameworkValue.provenance.effectiveUntil,
  });
  const sources = frameworkValue.provenance.sources;
  const sourceDigest = digest(sources.map((candidateSource) => ({
    sourceId: candidateSource.sourceId,
    sourceVersion: candidateSource.sourceVersion,
    sourceUri: candidateSource.sourceUri,
    artifactSha256: candidateSource.artifactSha256,
    license: candidateSource.license,
  })));
  return {
    framework: frameworkValue,
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
      approvedArtifactSha256: frameworkValue.provenance.artifactSha256,
      packageId: frameworkValue.provenance.packageId,
      packageVersion: frameworkValue.provenance.packageVersion,
    },
    evidence: {
      packageDigest,
      sourceDigest,
      licenseDigest: digest(sources.map((candidateSource) => candidateSource.license).sort()),
      artifactDigest: frameworkValue.provenance.artifactSha256,
      algorithmDigest: digest({ algorithmVersion: frameworkValue.provenance.algorithmVersion }),
      fixtureDigest: FIXTURE_DIGEST,
      rightsDigest: RIGHTS_DIGEST,
      disclaimerDigest: digest(CAREGIVER_MILESTONE_DISCLAIMER),
    },
  };
}

function resolved(frameworkValue = framework([milestone()])): Extract<DevelopmentFrameworkResolution, { ok: true }> {
  const result = resolveDevelopmentFramework(
    { countryOfCare: "CO", locale: "es-CO", asOf: CUTOFF_ISO, timeZone: "America/Bogota" },
    [candidate(frameworkValue)],
  );
  if (!result.ok) throw new Error(`fixture did not resolve: ${result.reason}`);
  return result;
}

function resolutionForFramework(frameworkValue: Extract<DevelopmentFramework, { audience: "caregiver" }>): Extract<DevelopmentFrameworkResolution, { ok: true }> {
  const base = resolved();
  const orderedSources = [...frameworkValue.provenance.sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.artifactSha256.localeCompare(right.artifactSha256));
  const value = {
    ...base.value,
    framework: frameworkValue,
    sourceDigest: digest(orderedSources.map((candidateSource) => ({
      sourceId: candidateSource.sourceId,
      sourceVersion: candidateSource.sourceVersion,
      sourceUri: candidateSource.sourceUri,
      artifactSha256: candidateSource.artifactSha256,
      license: candidateSource.license,
    }))),
    sourceDigests: orderedSources.map((candidateSource) => candidateSource.artifactSha256).sort(),
    licenseDigest: digest(orderedSources.map((candidateSource) => candidateSource.license).sort()),
    artifactDigest: frameworkValue.provenance.artifactSha256,
  };
  return { ok: true, value: { ...value, digest: digest(value) } } as Extract<DevelopmentFrameworkResolution, { ok: true }>;
}

type AgeWindowOverrides = Partial<{
  ageDays: number;
  basis: "chronological" | "corrected";
  referenceInstant: string;
  timeZone: string;
  algorithmVersion: string;
  provenance: MilestoneAgeWindow["provenance"];
  correctionPolicy: {
    policyId: string;
    policyVersion: string;
    artifactSha256: Sha256Hex;
    approvalDigest: Sha256Hex;
  };
}>;

function ageWindow(overrides: AgeWindowOverrides = {}): MilestoneAgeWindow {
  const basis = overrides.basis ?? "chronological";
  const provenance = overrides.provenance ?? {
    provenanceType: "system" as const,
    sourceId: "age-evidence-1",
    sourceDigest: AGE_SOURCE_DIGEST,
    observedAt: "2026-08-22T11:45:00.000Z",
  };
  const common = {
    ageDays: overrides.ageDays ?? 182,
    referenceInstant: overrides.referenceInstant ?? CUTOFF_ISO,
    timeZone: overrides.timeZone ?? "America/Bogota",
    provenance,
  };
  if (basis === "corrected") {
    return {
      ...common,
      basis,
      algorithmVersion: overrides.algorithmVersion ?? "corrected-age.v1",
      correctionPolicy: overrides.correctionPolicy ?? {
        policyId: "prematurity.v1",
        policyVersion: "2026.1",
        artifactSha256: AGE_POLICY_ARTIFACT_DIGEST,
        approvalDigest: AGE_POLICY_APPROVAL_DIGEST,
      },
    };
  }
  return {
    ...common,
    basis: "chronological",
    algorithmVersion: overrides.algorithmVersion ?? "chronological-age.v1",
  };
}

function input(overrides: Partial<MilestoneQueryInput> = {}): MilestoneQueryInput {
  return {
    frameworkId: FRAMEWORK_ID,
    ageWindow: ageWindow(),
    locale: "es-CO",
    cutoff: CUTOFF,
    ...overrides,
  };
}

function dependencies(
  resolution: DevelopmentFrameworkResolution | null = resolved(),
  freshScope: AuthorizedChildScope | null = scope(),
  requestNow = CUTOFF,
  trustedAge: MilestoneAgeWindow | null = ageWindow(),
) {
  const calls: string[] = [];
  const receivedScopes: AuthorizedChildScope[] = [];
  const ageInputs: Array<Readonly<{ basis: "chronological" | "corrected"; cutoff: string; timeZone: string }>> = [];
  const resolverInputs: Array<Readonly<{ frameworkId: string; locale: string; cutoff: string }>> = [];
  const accessRevalidator = {
    validate: async (receivedScope: AuthorizedChildScope, currentInstant: string) => {
      calls.push("validate");
      receivedScopes.push(receivedScope);
      expect(currentInstant).toBe(requestNow.toISOString());
      return freshScope;
    },
  };
  const ageEvidencePort: MilestoneAgeEvidencePort = {
    resolve: async (receivedScope, ageInput) => {
      calls.push("age");
      receivedScopes.push(receivedScope);
      ageInputs.push(ageInput);
      return trustedAge;
    },
  };
  const frameworkResolver: MilestoneFrameworkResolver = {
    resolve: async (receivedScope, resolverInput) => {
      calls.push("framework");
      receivedScopes.push(receivedScope);
      resolverInputs.push(resolverInput);
      return resolution;
    },
  };
  return {
    query: createMilestoneQuery({ accessRevalidator, ageEvidencePort, frameworkResolver }, { now: () => requestNow }),
    calls,
    receivedScopes,
    ageInputs,
    resolverInputs,
  };
}

const unavailable = { ok: false, status: "unavailable", code: "DEVELOPMENT_MILESTONES_UNAVAILABLE" } as const;

describe("authorized caregiver milestone query", () => {
  it("returns only inclusive same-child caregiver text with exact citations and disclaimer", async () => {
    const frameworkValue = framework([
      milestone({ id: "z-upper", minAgeDays: 0, maxAgeDays: 182 }),
      milestone({ id: "a-lower", minAgeDays: 182, maxAgeDays: 365 }),
      milestone({ id: "out-of-window", minAgeDays: 183, maxAgeDays: null }),
    ]);
    const deps = dependencies(resolved(frameworkValue));

    const result = await deps.query.execute(scope(), input());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("available");
    expect(result.frameworkId).toBe(FRAMEWORK_ID);
    expect(result.locale).toBe("es-CO");
    expect(result.milestones.map((item) => item.id)).toEqual(["a-lower", "z-upper"]);
    expect(result.milestones[0]).toEqual({
      id: "a-lower",
      domain: "language",
      title: "Communicates with a gesture",
      text: "You may notice the child using a gesture to share an interest.",
      citations: [{
        sourceId: source.sourceId,
        sourceUri: source.sourceUri,
        sourceVersion: source.sourceVersion,
        artifactSha256: SOURCE_ARTIFACT_DIGEST,
        license: source.license,
        retrievedAt: source.retrievedAt,
      }],
    });
    expect(result.disclaimer).toBe(CAREGIVER_MILESTONE_DISCLAIMER);
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.milestones)).not.toMatch(/score|total|pass|fail|normal|delay|ead|diagnos/i);
    expect(result).not.toHaveProperty("actorUserId");
    expect(result).not.toHaveProperty("careSpaceId");
    expect(result).not.toHaveProperty("childId");
    expect(deps.calls).toEqual(["validate", "age", "framework"]);
    expect(deps.receivedScopes[0]).toBeDefined();
    expect(deps.receivedScopes[1]).toBeDefined();
    expect(deps.receivedScopes[1]).toBe(deps.receivedScopes[2]);
    expect(deps.ageInputs).toEqual([{
      basis: "chronological",
      cutoff: CUTOFF_ISO,
      timeZone: "America/Bogota",
    }]);
    expect(deps.resolverInputs).toEqual([{ frameworkId: FRAMEWORK_ID, locale: "es-CO", cutoff: CUTOFF_ISO }]);
  });

  it("uses a corrected age only when the trusted age basis is explicit and never calculates it", async () => {
    const deps = dependencies(
      resolved(framework([milestone({ id: "corrected", minAgeDays: 182, maxAgeDays: 182 })])),
      scope(),
      CUTOFF,
      ageWindow({ basis: "corrected" }),
    );
    const result = await deps.query.execute(scope(), input({ ageWindow: ageWindow({ basis: "corrected" }) }));

    expect(result.ok).toBe(true);
    expect(deps.ageInputs).toEqual([{ basis: "corrected", cutoff: CUTOFF_ISO, timeZone: "America/Bogota" }]);
    expect(deps.resolverInputs).toHaveLength(1);
  });

  it("uses only resolver-returned age evidence and rejects caller age, cutoff, timezone, or policy tampering", async () => {
    const changedAge = dependencies(undefined, undefined, CUTOFF, ageWindow({ ageDays: 183 }));
    const changedAgeResult = await changedAge.query.execute(scope(), input());

    const changedCutoff = dependencies();
    const changedCutoffResult = await changedCutoff.query.execute(scope(), input({ cutoff: "2026-08-22T12:01:00.000Z" }));

    const changedTimezone = dependencies();
    const changedTimezoneResult = await changedTimezone.query.execute(scope(), input({ ageWindow: ageWindow({ timeZone: "UTC" }) }));

    const trustedCorrected = ageWindow({ basis: "corrected" }) as Extract<MilestoneAgeWindow, { basis: "corrected" }>;
    const changedPolicy = dependencies(undefined, undefined, CUTOFF, trustedCorrected);
    const changedPolicyResult = await changedPolicy.query.execute(scope(), input({
      ageWindow: ageWindow({
        basis: "corrected",
        correctionPolicy: { ...trustedCorrected.correctionPolicy, approvalDigest: "2".repeat(64) as Sha256Hex },
      }),
    }));

    expect(changedAgeResult).toEqual(unavailable);
    expect(changedCutoffResult).toEqual(unavailable);
    expect(changedTimezoneResult).toEqual(unavailable);
    expect(changedPolicyResult).toEqual(unavailable);
    expect(changedAge.calls).toEqual(["validate", "age"]);
    expect(changedCutoff.calls).toEqual(["validate", "age"]);
    expect(changedTimezone.calls).toEqual(["validate", "age"]);
    expect(changedPolicy.calls).toEqual(["validate", "age"]);
  });

  it("fails closed when the trusted corrected-age policy is missing or malformed", async () => {
    const missing = dependencies(undefined, undefined, CUTOFF, null);
    const malformed = dependencies(undefined, undefined, CUTOFF, {
      ...ageWindow({ basis: "corrected" }),
      correctionPolicy: undefined,
    } as never);

    const missingResult = await missing.query.execute(scope(), input({ ageWindow: ageWindow({ basis: "corrected" }) }));
    const malformedResult = await malformed.query.execute(scope(), input({ ageWindow: ageWindow({ basis: "corrected" }) }));

    expect(missingResult).toEqual(unavailable);
    expect(malformedResult).toEqual(unavailable);
  });

  it.each([
    ["negative", ageWindow({ ageDays: -1 })],
    ["fractional", ageWindow({ ageDays: 182.5 })],
    ["pediatric overflow", ageWindow({ ageDays: 18 * 366 + 1 })],
    ["missing basis", { ...ageWindow(), basis: undefined }],
    ["unknown basis", { ...ageWindow(), basis: "guessed" }],
  ] as const)("fails closed for invalid or non-explicit %s age", async (_label, ageWindow) => {
    const deps = dependencies();
    const result = await deps.query.execute(scope(), input({ ageWindow: ageWindow as never }));

    expect(result).toEqual(unavailable);
    expect(deps.calls).toEqual([]);
  });

  it("rejects authority, approval, and country fields instead of accepting model-selected context", async () => {
    const deps = dependencies();
    const result = await deps.query.execute(scope(), {
      ...input(),
      countryOfCare: "US",
      approvalDigest: "forged",
    } as never);

    expect(result).toEqual(unavailable);
    expect(deps.calls).toEqual([]);
  });

  it("accepts exact pediatric age boundaries without silently changing the supplied age", async () => {
    const lower = dependencies(
      resolved(framework([milestone({ id: "newborn", minAgeDays: 0, maxAgeDays: 0 })])),
      scope(),
      CUTOFF,
      ageWindow({ ageDays: 0 }),
    );
    const upper = dependencies(
      resolved(framework([milestone({ id: "adult-bound", minAgeDays: 18 * 366, maxAgeDays: 18 * 366 })])),
      scope(),
      CUTOFF,
      ageWindow({ ageDays: 18 * 366 }),
    );

    const lowerResult = await lower.query.execute(scope(), input({ ageWindow: ageWindow({ ageDays: 0 }) }));
    const upperResult = await upper.query.execute(scope(), input({ ageWindow: ageWindow({ ageDays: 18 * 366 }) }));

    expect(lowerResult.ok).toBe(true);
    expect(upperResult.ok).toBe(true);
  });

  it("requires exact trusted age evidence and an approved corrected-age policy without fallback", async () => {
    const corrected = ageWindow({ basis: "corrected" });
    const cases = [
      { ...corrected, correctionPolicy: undefined },
      ageWindow({ algorithmVersion: "gemini-3.6-flash" }),
      ageWindow({ provenance: { ...ageWindow().provenance, sourceId: "gemini-age" } }),
      ageWindow({ provenance: { ...ageWindow().provenance, provenanceType: "guardian" } as never }),
      ageWindow({ referenceInstant: "2026-08-22T11:59:59.000Z" }),
      ageWindow({ timeZone: "UTC" }),
      ageWindow({ provenance: { ...ageWindow().provenance, observedAt: "2026-08-22T12:00:00.001Z" } }),
      { ...ageWindow(), correctionPolicy: corrected.correctionPolicy } as never,
      ageWindow({ basis: "corrected", correctionPolicy: {
        policyId: "fallback",
        policyVersion: "2026.1",
        artifactSha256: AGE_POLICY_ARTIFACT_DIGEST,
        approvalDigest: AGE_POLICY_APPROVAL_DIGEST,
      } }),
    ] as const;

    for (const candidateAge of cases) {
      const deps = dependencies();
      const result = await deps.query.execute(scope(), input({ ageWindow: candidateAge as never }));
      expect(result).toEqual(unavailable);
    }
  });

  it("fails closed for missing, revoked, mixed, or ambiguous framework resolution", async () => {
    const missing = dependencies(null);
    const revoked = dependencies({ ok: false, code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE", reason: "REVOKED", digest: "a".repeat(64) as Sha256Hex });
    const mixed = dependencies(resolved(framework([milestone({ id: "one" }), milestone({ id: "two" })])));
    const ambiguous = dependencies({ ok: false, code: "DEVELOPMENT_FRAMEWORK_UNAVAILABLE", reason: "AMBIGUOUS_CANDIDATE", digest: "b".repeat(64) as Sha256Hex });

    const mixedResolution = await mixed.query.execute(scope(), input({ frameworkId: "other-framework" }));
    const results = await Promise.all([
      missing.query.execute(scope(), input()),
      revoked.query.execute(scope(), input()),
      mixedResolution,
      ambiguous.query.execute(scope(), input()),
    ]);

    expect(results[0]).toEqual(unavailable);
    expect(results[1]).toEqual(unavailable);
    expect(results[2]).toEqual(unavailable);
    expect(results[3]).toEqual(unavailable);
  });

  it.each([
    ["expired", scope({ expiresAt: new Date("2026-08-22T12:00:00.000Z") })],
    ["read denied", scope({ permissions: ["record"] })],
  ] as const)("denies local %s scope before resolver access", async (_label, requestScope) => {
    const deps = dependencies();
    const result = await deps.query.execute(requestScope, input());

    expect(result).toEqual(unavailable);
    expect(deps.calls).toEqual([]);
  });

  it.each([
    ["revoked", null],
    ["sibling", scope({ childId: SIBLING_ID })],
    ["foreign space", scope({ careSpaceId: OTHER_SPACE_ID })],
    ["actor drift", scope({ actorUserId: "00000000-0000-4000-8000-000000000006" })],
    ["country drift", scope({ countryOfCare: "US", timezone: "America/New_York" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["read", "record"] })],
  ] as const)("denies revalidation %s before framework resolution", async (_label, freshScope) => {
    const deps = dependencies(resolved(), freshScope);
    const result = await deps.query.execute(scope(), input());

    expect(result).toEqual(unavailable);
    expect(deps.calls).toEqual(["validate"]);
  });

  it.each([
    ["locale mismatch", input({ locale: "en-US" })],
    ["country-locale mismatch", input({ locale: "en-US" })],
    ["wrong framework", input({ frameworkId: "other-framework" })],
  ] as const)("does not fall back for %s", async (_label, requestInput) => {
    const deps = dependencies();
    const result = await deps.query.execute(scope(), requestInput);

    expect(result).toEqual(unavailable);
    expect(deps.calls).toEqual(requestInput.locale === "es-CO" ? ["validate", "age", "framework"] : ["validate"]);
  });

  it("rejects an empty package and returns an empty list only for a valid non-empty package with no matching age", async () => {
    const empty = dependencies(resolved(framework([])));
    const noMatch = dependencies(resolved(framework([milestone({ minAgeDays: 183, maxAgeDays: null })])));

    const emptyResult = await empty.query.execute(scope(), input());
    const noMatchResult = await noMatch.query.execute(scope(), input());

    expect(emptyResult).toEqual(unavailable);
    expect(noMatchResult).toMatchObject({ ok: true, status: "available", milestones: [] });
  });

  it("rejects professional leakage and malformed item provenance instead of partially returning content", async () => {
    const base = resolved();
    const baseItem = base.value.framework.items[0]!;
    const professionalResolution = {
      ok: true as const,
      value: {
      ...base.value,
      framework: { ...base.value.framework, items: [{ ...baseItem, id: "ead3-caregiver" }] },
      },
    } as Extract<DevelopmentFrameworkResolution, { ok: true }>;
    const malformedResolution = {
      ok: true as const,
      value: {
      ...base.value,
      framework: { ...base.value.framework, items: [{ ...baseItem, caregiverCopy: "This is normal and passed." }] },
      },
    } as Extract<DevelopmentFrameworkResolution, { ok: true }>;
    const professional = dependencies(professionalResolution);
    const malformed = dependencies(malformedResolution);

    const professionalResult = await professional.query.execute(scope(), input());
    const malformedResult = await malformed.query.execute(scope(), input());

    expect(professionalResult).toEqual(unavailable);
    expect(malformedResult).toEqual(unavailable);
  });

  it("rejects Spanish professional markers in caregiver text and source metadata", async () => {
    const spanishItem = dependencies(resolved(framework([milestone({ caregiverCopy: "Esto no es un diagnóstico ni un retraso: tampoco es cribado ni contiene puntuaciones retrasadas." })])));
    const spanishSource = dependencies(resolutionForFramework(framework([milestone()], [{
      ...source,
      sourceId: "instrumento-profesional",
      sourceUri: "https://example.invalid/tamizaje",
    }])));

    const itemResult = await spanishItem.query.execute(scope(), input());
    const sourceResult = await spanishSource.query.execute(scope(), input());

    expect(itemResult).toEqual(unavailable);
    expect(sourceResult).toEqual(unavailable);
  });

  it("rejects duplicate source identifiers or artifact digests before citations", async () => {
    const duplicateArtifact = dependencies(resolutionForFramework(framework([milestone()], [source, { ...source, sourceId: "second-source" }])));
    const duplicateId = dependencies(resolutionForFramework(framework([milestone()], [source, { ...source, artifactSha256: "2".repeat(64) as Sha256Hex }])));

    const artifactResult = await duplicateArtifact.query.execute(scope(), input());
    const idResult = await duplicateId.query.execute(scope(), input());

    expect(artifactResult).toEqual(unavailable);
    expect(idResult).toEqual(unavailable);
  });

  it("keeps ordering and digest stable for equivalent framework item order", async () => {
    const first = dependencies(resolved(framework([
      milestone({ id: "z-item" }),
      milestone({ id: "a-item" }),
    ])));
    const second = dependencies(resolved(framework([
      milestone({ id: "a-item" }),
      milestone({ id: "z-item" }),
    ])));

    const left = await first.query.execute(scope(), input());
    const right = await second.query.execute(scope(), input());

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(right.milestones).toEqual(left.milestones);
    expect(right.digest).toBe(left.digest);
  });

  it("fails closed on resolver errors, cutoff drift, and future effective evidence", async () => {
    const throwing = dependencies();
    throwing.query = createMilestoneQuery({
      accessRevalidator: {
        validate: async () => scope(),
      },
      ageEvidencePort: {
        resolve: async () => ageWindow(),
      },
      frameworkResolver: {
        resolve: async () => { throw new Error("resolver unavailable"); },
      },
    }, { now: () => CUTOFF });
    const throwingResult = await throwing.query.execute(scope(), input());

    const futureBase = resolved();
    const futureFramework = {
      ...futureBase.value.framework,
      provenance: { ...futureBase.value.framework.provenance, effectiveFrom: "2026-08-23" },
      items: futureBase.value.framework.items.map((item) => ({ ...item, provenance: { ...item.provenance, effectiveFrom: "2026-08-23" } })),
    };
    const future = dependencies({ ok: true, value: { ...futureBase.value, framework: futureFramework } } as Extract<DevelopmentFrameworkResolution, { ok: true }>);
    const futureResult = await future.query.execute(scope(), input());

    expect(throwingResult).toEqual(unavailable);
    expect(futureResult).toEqual(unavailable);
  });
});
