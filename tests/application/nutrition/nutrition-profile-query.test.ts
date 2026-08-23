import { describe, expect, it } from "vitest";

import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  createNutritionProfileQuery,
  type NutritionAccessRevalidator,
  type NutritionAgePort,
  type NutritionProfileRepository,
  type NutritionProfileRow,
} from "../../../src/application/nutrition/nutrition-profile-query.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";
import type { NutritionAgeEvidence } from "../../../src/clinical/nutrition/types.ts";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const SIBLING_ID = "00000000-0000-4000-8000-000000000004";
const PROFILE_ID = "00000000-0000-4000-8000-000000000005";
const OTHER_SPACE_ID = "00000000-0000-4000-8000-000000000006";
const CUTOFF = new Date("2026-08-22T12:00:00.000Z");
const CUTOFF_ISO = "2026-08-22T12:00:00.000Z";
const DIGEST = "a".repeat(64);

function scope(overrides: Partial<{
  careSpaceId: string;
  childId: string;
  permissions: readonly ("read" | "record" | "manage_documents" | "manage_medication" | "manage_guardians")[];
  issuedAt: Date;
  expiresAt: Date;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR_ID,
    careSpaceId: overrides.careSpaceId ?? SPACE_ID,
    childId: overrides.childId ?? CHILD_ID,
    permissions: overrides.permissions ?? ["read"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: overrides.issuedAt ?? new Date("2026-08-22T11:58:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date("2026-08-22T12:02:00.000Z"),
  });
}

function profile(overrides: Partial<NutritionProfileRow> = {}): NutritionProfileRow {
  return {
    id: PROFILE_ID,
    careSpaceId: SPACE_ID,
    childId: CHILD_ID,
    feedingMode: "blw",
    textureStage: "soft_lumpy",
    exclusions: ["whole-grape", "peanut"],
    createdAt: "2026-08-22T11:00:00.000Z",
    updatedAt: "2026-08-22T11:30:00.000Z",
    ...overrides,
  };
}

function age(overrides: Partial<NutritionAgeEvidence> = {}): NutritionAgeEvidence {
  return {
    ageDays: 182,
    basis: "chronological",
    referenceInstant: CUTOFF_ISO,
    timeZone: "America/Bogota",
    algorithmVersion: "chronological-age.v1",
    provenance: {
      provenanceType: "system",
      sourceId: "age-evidence-1",
      sourceDigest: DIGEST as Sha256Hex,
      observedAt: "2026-08-22T11:45:00.000Z",
    },
    ...overrides,
  };
}

function dependencies(
  row: NutritionProfileRow | null,
  ageEvidence: NutritionAgeEvidence | null = age(),
  revalidatedScope: AuthorizedChildScope | null = scope(),
  revalidate: "return" | "throw" = "return",
  requestNow = CUTOFF,
) {
  const calls: string[] = [];
  const receivedScopes: AuthorizedChildScope[] = [];
  const receivedAccessInstants: string[] = [];
  const receivedCutoffs: string[] = [];
  const accessRevalidator: NutritionAccessRevalidator = {
    async validate(receivedScope, currentInstant) {
      calls.push("validate");
      receivedScopes.push(receivedScope);
      receivedAccessInstants.push(currentInstant);
      if (revalidate === "throw") throw new Error("revoked");
      return revalidatedScope;
    },
  };
  const profileRepository: NutritionProfileRepository = {
    async getProfile(receivedScope, cutoff) {
      calls.push("profile");
      receivedScopes.push(receivedScope);
      receivedCutoffs.push(cutoff);
      return row;
    },
  };
  const agePort: NutritionAgePort = {
    async getAge(receivedScope, cutoff) {
      calls.push("age");
      receivedScopes.push(receivedScope);
      receivedCutoffs.push(cutoff);
      return ageEvidence;
    },
  };
  return {
    query: createNutritionProfileQuery({ accessRevalidator, profileRepository, agePort }, { now: () => requestNow }),
    calls,
    receivedScopes,
    receivedAccessInstants,
    receivedCutoffs,
  };
}

describe("authorized nutrition profile query", () => {
  it("returns the minimum same-child projection with trusted age and explicit unknown plan", async () => {
    const requestScope = scope();
    const freshScope = scope();
    const deps = dependencies(profile(), age(), freshScope);

    const result = await deps.query.execute(requestScope, CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("available");
    expect(result.age.ageDays).toBe(182);
    expect(result.age.provenance.sourceId).toBe("age-evidence-1");
    expect(result.profile).toEqual({
      feedingApproach: "blw",
      textureStage: "soft_lumpy",
      exclusions: ["peanut", "whole-grape"],
      source: {
        sourceId: PROFILE_ID,
        createdAt: "2026-08-22T11:00:00.000Z",
        updatedAt: "2026-08-22T11:30:00.000Z",
      },
    });
    expect(result.professionalPlan).toBe("unknown");
    expect(result.completeness).toEqual({
      age: "complete",
      feedingApproach: "complete",
      textureStage: "complete",
      exclusions: "complete",
      professionalPlan: "unknown",
    });
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty("actorUserId");
    expect(result).not.toHaveProperty("careSpaceId");
    expect(result).not.toHaveProperty("childId");
    expect(deps.calls).toEqual(["validate", "profile", "age"]);
    expect(deps.receivedScopes[0]).toBe(requestScope);
    expect(deps.receivedScopes[1]).toBe(freshScope);
    expect(deps.receivedScopes[2]).toBe(freshScope);
    expect(deps.receivedAccessInstants).toEqual([CUTOFF_ISO]);
    expect(deps.receivedCutoffs).toEqual([CUTOFF_ISO, CUTOFF_ISO]);
  });

  it("returns one uniform fail-closed result for missing, sibling, and foreign-space rows", async () => {
    const missing = dependencies(null);
    const sibling = dependencies(profile({ childId: SIBLING_ID }));
    const foreign = dependencies(profile({ careSpaceId: OTHER_SPACE_ID }));

    const missingResult = await missing.query.execute(scope(), CUTOFF);
    const siblingResult = await sibling.query.execute(scope(), CUTOFF);
    const foreignResult = await foreign.query.execute(scope(), CUTOFF);

    expect(missingResult).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(siblingResult).toEqual(missingResult);
    expect(foreignResult).toEqual(missingResult);
    expect(missing.calls).toEqual(["validate", "profile"]);
    expect(sibling.calls).toEqual(["validate", "profile"]);
    expect(foreign.calls).toEqual(["validate", "profile"]);
  });

  it("denies expired and read-denied local scopes before revalidation", async () => {
    const expired = dependencies(profile());
    const readDenied = dependencies(profile());

    const expiredResult = await expired.query.execute(scope({ expiresAt: new Date("2026-08-22T12:00:00.000Z") }), CUTOFF);
    const readDeniedResult = await readDenied.query.execute(scope({ permissions: ["record"] }), CUTOFF);

    expect(expiredResult).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(readDeniedResult).toEqual(expiredResult);
    expect(expired.calls).toEqual([]);
    expect(readDenied.calls).toEqual([]);
  });

  it("denies a revoked scope when trusted revalidation returns null", async () => {
    const deps = dependencies(profile(), age(), null);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it.each([
    ["actor drift", { actorUserId: "00000000-0000-4000-8000-000000000008", careSpaceId: SPACE_ID, childId: CHILD_ID, authorizationVersion: "m:1:a:1" }],
    ["space drift", { actorUserId: ACTOR_ID, careSpaceId: OTHER_SPACE_ID, childId: CHILD_ID, authorizationVersion: "m:1:a:1" }],
    ["child drift", { actorUserId: ACTOR_ID, careSpaceId: SPACE_ID, childId: SIBLING_ID, authorizationVersion: "m:1:a:1" }],
    ["authorization drift", { actorUserId: ACTOR_ID, careSpaceId: SPACE_ID, childId: CHILD_ID, authorizationVersion: "m:1:a:2" }],
  ] as const)("denies trusted-scope %s without reading profile or age", async (_label, change) => {
    const freshScope = createAuthorizedChildScopeFromTrustedRow({
      actorUserId: change.actorUserId ?? ACTOR_ID,
      careSpaceId: change.careSpaceId ?? SPACE_ID,
      childId: change.childId ?? CHILD_ID,
      permissions: ["read"],
      countryOfCare: "CO",
      timezone: "America/Bogota",
      authorizationVersion: change.authorizationVersion ?? "m:1:a:1",
      issuedAt: new Date("2026-08-22T11:58:00.000Z"),
      expiresAt: new Date("2026-08-22T12:02:00.000Z"),
    });
    const deps = dependencies(profile(), age(), freshScope);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it.each([
    ["expired", scope({ expiresAt: new Date("2026-08-22T11:59:00.000Z") })],
    ["read denied", scope({ permissions: ["record"] })],
  ] as const)("denies revalidated %s scope without reading profile or age", async (_label, freshScope) => {
    const deps = dependencies(profile(), age(), freshScope);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it("denies when trusted revalidation throws without reading profile or age", async () => {
    const deps = dependencies(profile(), age(), scope(), "throw");

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it("uses trusted request time for authorization instead of a historical fact cutoff", async () => {
    const deps = dependencies(profile(), age(), scope(), "return", new Date("2026-08-22T12:03:00.000Z"));

    const result = await deps.query.execute(scope(), new Date("2026-08-22T12:00:00.000Z"));

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual([]);
  });

  it("rejects fresh permission widening before reading profile or age", async () => {
    const widenedScope = scope({ permissions: ["read", "record"] });
    const deps = dependencies(profile(), age(), widenedScope);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "NUTRITION_PROFILE_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it("rejects future profile facts and permits the exact cutoff boundary", async () => {
    const future = dependencies(profile({ updatedAt: "2026-08-22T12:00:00.001Z" }));
    const boundary = dependencies(profile({ updatedAt: CUTOFF_ISO }));

    const futureResult = await future.query.execute(scope(), CUTOFF);
    const boundaryResult = await boundary.query.execute(scope(), CUTOFF);

    expect(futureResult.ok).toBe(false);
    expect(boundaryResult.ok).toBe(true);
    expect(future.calls).toEqual(["validate", "profile"]);
    expect(boundary.calls).toEqual(["validate", "profile", "age"]);
  });

  it("rejects malformed, duplicate, and chronologically conflicting profile values", async () => {
    const invalidEnum = dependencies(profile({ feedingMode: "diagnosis" as never }));
    const duplicateExclusion = dependencies(profile({ exclusions: ["peanut", "peanut"] }));
    const invalidDates = dependencies(profile({ createdAt: "2026-08-22T11:30:00.000Z", updatedAt: "2026-08-22T11:00:00.000Z" }));

    const invalidEnumResult = await invalidEnum.query.execute(scope(), CUTOFF);
    const duplicateResult = await duplicateExclusion.query.execute(scope(), CUTOFF);
    const invalidDatesResult = await invalidDates.query.execute(scope(), CUTOFF);

    expect(invalidEnumResult.ok).toBe(false);
    expect(duplicateResult.ok).toBe(false);
    expect(invalidDatesResult.ok).toBe(false);
    expect(invalidEnum.calls).toEqual(["validate", "profile"]);
    expect(duplicateExclusion.calls).toEqual(["validate", "profile"]);
    expect(invalidDates.calls).toEqual(["validate", "profile"]);
  });

  it("requires age evidence to match the fixed cutoff and authorized timezone", async () => {
    const wrongReference = dependencies(profile(), age({ referenceInstant: "2026-08-22T11:59:59.000Z" }));
    const wrongTimeZone = dependencies(profile(), age({ timeZone: "UTC" }));
    const futureObservation = dependencies(profile(), age({ provenance: { ...age().provenance, observedAt: "2026-08-22T12:00:00.001Z" } }));
    const missingAge = dependencies(profile(), null);

    const wrongReferenceResult = await wrongReference.query.execute(scope(), CUTOFF);
    const wrongTimeZoneResult = await wrongTimeZone.query.execute(scope(), CUTOFF);
    const futureObservationResult = await futureObservation.query.execute(scope(), CUTOFF);
    const missingAgeResult = await missingAge.query.execute(scope(), CUTOFF);

    expect(wrongReferenceResult.ok).toBe(false);
    expect(wrongTimeZoneResult.ok).toBe(false);
    expect(futureObservationResult.ok).toBe(false);
    expect(missingAgeResult.ok).toBe(false);
    expect(wrongReference.calls).toEqual(["validate", "profile", "age"]);
    expect(wrongTimeZone.calls).toEqual(["validate", "profile", "age"]);
    expect(futureObservation.calls).toEqual(["validate", "profile", "age"]);
    expect(missingAge.calls).toEqual(["validate", "profile", "age"]);
  });

  it("keeps ordering and digest stable for equivalent exclusion input order", async () => {
    const first = dependencies(profile({ exclusions: ["z-code", "a-code", "m-code"] }));
    const second = dependencies(profile({ exclusions: ["m-code", "z-code", "a-code"] }));

    const firstResult = await first.query.execute(scope(), CUTOFF);
    const secondResult = await second.query.execute(scope(), CUTOFF);

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (!firstResult.ok || !secondResult.ok) return;
    expect(firstResult.profile.exclusions).toEqual(["a-code", "m-code", "z-code"]);
    expect(secondResult.profile.exclusions).toEqual(firstResult.profile.exclusions);
    expect(secondResult.digest).toBe(firstResult.digest);
  });

  it("reports nullable feeding and texture facts as missing completeness", async () => {
    const deps = dependencies(profile({ feedingMode: null, textureStage: null, exclusions: [] }));

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.feedingApproach).toBeNull();
    expect(result.profile.textureStage).toBeNull();
    expect(result.completeness).toEqual({
      age: "complete",
      feedingApproach: "missing",
      textureStage: "missing",
      exclusions: "complete",
      professionalPlan: "unknown",
    });
  });
});
