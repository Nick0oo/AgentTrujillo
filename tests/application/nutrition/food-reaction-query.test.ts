import { describe, expect, it } from "vitest";

import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  createFoodReactionQuery,
  type FoodReactionRepository,
  type FoodReactionRow,
  type FoodReactionAccessRevalidator,
} from "../../../src/application/nutrition/food-reaction-query.ts";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const CUTOFF = new Date("2026-08-22T12:00:00.000Z");

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

function reaction(overrides: Partial<FoodReactionRow> = {}): FoodReactionRow {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    careSpaceId: SPACE_ID,
    childId: CHILD_ID,
    substanceName: "peanut",
    normalizedCode: "food.peanut",
    reactionType: "allergy",
    severity: "unknown",
    status: "confirmed",
    provenanceType: "professional",
    observedOn: "2026-08-20",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function dependencies(
  rows: readonly FoodReactionRow[] | null,
  freshScope: AuthorizedChildScope | null = scope(),
  requestNow = CUTOFF,
) {
  const calls: string[] = [];
  const receivedScopes: AuthorizedChildScope[] = [];
  const accessInstants: string[] = [];
  const cutoffs: string[] = [];
  const accessRevalidator: FoodReactionAccessRevalidator = {
    validate: async (receivedScope, currentInstant) => {
      calls.push("validate");
      receivedScopes.push(receivedScope);
      accessInstants.push(currentInstant);
      return freshScope;
    },
  };
  const repository: FoodReactionRepository = {
    getReactions: async (receivedScope, cutoff) => {
      calls.push("repository");
      receivedScopes.push(receivedScope);
      cutoffs.push(cutoff);
      return rows;
    },
  };
  return {
    query: createFoodReactionQuery({ accessRevalidator, repository }, { now: () => requestNow }),
    calls,
    receivedScopes,
    accessInstants,
    cutoffs,
    freshScope,
  };
}

describe("authorized food-reaction query", () => {
  it("returns a same-child reaction projection", async () => {
    const deps = dependencies([reaction()]);
    const requestScope = scope();
    const result = await deps.query.execute(requestScope, CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions).toHaveLength(1);
    expect(result.reactions[0]).toMatchObject({
      identity: {
        id: "00000000-0000-4000-8000-000000000010",
        foodLabel: "peanut",
        foodCode: "food.peanut",
        mapping: "normalized",
      },
      declaration: {
        reactionType: "allergy",
        severity: "unknown",
        status: "confirmed",
        lifecycle: "active",
      },
      confirmation: { status: "confirmed" },
      supersession: "unknown",
      provenance: {
        provenanceType: "professional",
        observedOn: "2026-08-20",
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
    });
    expect(result.reactions[0]?.uncertainty).toContain("supersession_unavailable");
    expect(deps.calls).toEqual(["validate", "repository"]);
    expect(deps.receivedScopes[0]).toBe(requestScope);
    expect(deps.receivedScopes[1]).toBe(deps.freshScope);
    expect(deps.cutoffs).toEqual(["2026-08-22T12:00:00.000Z"]);
  });

  it("keeps declared and confirmed declarations distinct without diagnosing allergy", async () => {
    const deps = dependencies([
      reaction({
        id: "00000000-0000-4000-8000-000000000011",
        normalizedCode: null,
        substanceName: "milk",
        reactionType: "intolerance",
        severity: "mild",
        status: "declared",
        provenanceType: "guardian",
      }),
      reaction({
        id: "00000000-0000-4000-8000-000000000012",
        substanceName: "egg",
        reactionType: "preference",
        severity: null,
        status: "confirmed",
        provenanceType: "professional",
      }),
      reaction({
        id: "00000000-0000-4000-8000-000000000013",
        substanceName: "fish",
        reactionType: "avoidance",
        severity: null,
        status: "confirmed",
        provenanceType: "guardian",
      }),
    ]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions.map((item) => [item.declaration.reactionType, item.declaration.status])).toEqual([
      ["intolerance", "declared"],
      ["preference", "confirmed"],
      ["avoidance", "confirmed"],
    ]);
    expect(result.reactions[0]?.confirmation.status).toBe("declared");
    expect(result.reactions[1]?.confirmation.status).toBe("confirmed");
    expect(JSON.stringify(result)).not.toMatch(/diagnos|safe|challenge|reintroduc/i);
  });

  it("keeps resolved and entered-in-error history distinct from active facts", async () => {
    const deps = dependencies([
      reaction({ id: "00000000-0000-4000-8000-000000000014", status: "resolved" }),
      reaction({ id: "00000000-0000-4000-8000-000000000015", status: "entered_in_error" }),
    ]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions.map((item) => item.declaration.lifecycle)).toEqual(["resolved", "entered_in_error"]);
    expect(result.reactions.every((item) => item.declaration.lifecycle !== "active")).toBe(true);
    expect(result.reactions.every((item) => item.confirmation.status === "unknown")).toBe(true);
    expect(result.reactions.every((item) => item.uncertainty.includes("confirmation_uncertain"))).toBe(true);
  });

  it("denies missing, sibling, foreign, and mixed rows uniformly", async () => {
    const missing = dependencies(null);
    const sibling = dependencies([reaction({ childId: "00000000-0000-4000-8000-000000000004" })]);
    const foreign = dependencies([reaction({ careSpaceId: "00000000-0000-4000-8000-000000000005" })]);
    const mixed = dependencies([
      reaction(),
      reaction({ id: "00000000-0000-4000-8000-000000000016", childId: "00000000-0000-4000-8000-000000000004" }),
    ]);

    const results = await Promise.all([
      missing.query.execute(scope(), CUTOFF),
      sibling.query.execute(scope(), CUTOFF),
      foreign.query.execute(scope(), CUTOFF),
      mixed.query.execute(scope(), CUTOFF),
    ]);

    expect(results[0]).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[3]).toEqual(results[0]);
  });

  it.each([
    ["revocation", null],
    ["actor drift", scope({ actorUserId: "00000000-0000-4000-8000-000000000006" })],
    ["space drift", scope({ careSpaceId: "00000000-0000-4000-8000-000000000007" })],
    ["child drift", scope({ childId: "00000000-0000-4000-8000-000000000008" })],
    ["version drift", scope({ authorizationVersion: "m:1:a:2" })],
    ["country drift", scope({ countryOfCare: "US" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["read", "record"] })],
  ] as const)("denies revalidation %s before repository access", async (_label, freshScope) => {
    const deps = dependencies([reaction()], freshScope);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
    expect(deps.calls).toEqual(["validate"]);
  });

  it("evaluates scope at request now, not at a historical cutoff", async () => {
    const requestScope = scope({ expiresAt: new Date("2026-08-22T12:02:00.000Z") });
    const deps = dependencies([reaction()], requestScope);
    const query = createFoodReactionQuery(
      {
        accessRevalidator: {
          validate: async (_scope, currentInstant) => {
            expect(currentInstant).toBe("2026-08-22T12:03:00.000Z");
            return requestScope;
          },
        },
        repository: { getReactions: async () => [reaction()] },
      },
      { now: () => new Date("2026-08-22T12:03:00.000Z") },
    );

    const result = await query.execute(requestScope, new Date("2026-08-22T12:00:00.000Z"));

    expect(result).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
    expect(deps.calls).toEqual([]);
  });

  it("rejects malformed rows before exposing a partial history", async () => {
    const malformed = dependencies([reaction({ updatedAt: "not-an-instant" })]);

    const result = await malformed.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
  });

  it("keeps duplicates and ambiguous unmapped food explicit", async () => {
    const duplicate = reaction({ id: "00000000-0000-4000-8000-000000000017" });
    const ambiguous = reaction({
      id: "00000000-0000-4000-8000-000000000018",
      normalizedCode: null,
      substanceName: "peanut",
      reactionType: "avoidance",
      status: "declared",
      provenanceType: "guardian",
    });
    const ambiguousOther = reaction({
      id: "00000000-0000-4000-8000-000000000024",
      normalizedCode: null,
      substanceName: "peanut",
      reactionType: "preference",
      status: "confirmed",
      provenanceType: "professional",
    });
    const deps = dependencies([duplicate, ambiguous, ambiguousOther, duplicate]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions).toHaveLength(4);
    expect(result.reactions.filter((item) => item.identity.id === duplicate.id)).toHaveLength(2);
    expect(result.reactions.every((item) => item.uncertainty.includes("supersession_unavailable"))).toBe(true);
    expect(result.reactions.filter((item) => item.identity.id === duplicate.id).every((item) => item.uncertainty.includes("duplicate_identity"))).toBe(true);
    expect(result.reactions.find((item) => item.identity.id === ambiguous.id)?.uncertainty).toEqual(expect.arrayContaining(["unmapped_food", "conflicting_evidence"]));
  });

  it("omits rows created strictly after the cutoff while retaining historical facts", async () => {
    const deps = dependencies([
      reaction({ id: "00000000-0000-4000-8000-000000000019" }),
      reaction({ id: "00000000-0000-4000-8000-000000000020", createdAt: "2026-08-22T12:00:00.001Z", updatedAt: "2026-08-22T12:00:00.001Z" }),
    ]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions.map((item) => item.identity.id)).toEqual(["00000000-0000-4000-8000-000000000019"]);
  });

  it("denies a pre-cutoff row whose update is after the cutoff", async () => {
    const deps = dependencies([reaction({
      id: "00000000-0000-4000-8000-000000000021",
      createdAt: "2026-08-22T11:00:00.000Z",
      updatedAt: "2026-08-22T12:00:00.001Z",
    })]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
  });

  it("denies an existing row that claims an observation after the local cutoff date", async () => {
    const deps = dependencies([reaction({
      id: "00000000-0000-4000-8000-000000000027",
      observedOn: "2026-08-23",
      createdAt: "2026-08-22T11:00:00.000Z",
      updatedAt: "2026-08-22T11:30:00.000Z",
    })]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result).toEqual({ ok: false, status: "unavailable", code: "FOOD_REACTIONS_UNAVAILABLE" });
  });

  it("uses the authorized timezone for calendar cutoffs near UTC midnight", async () => {
    const localCutoff = new Date("2026-08-23T04:00:00.000Z");
    const requestScope = scope({
      issuedAt: new Date("2026-08-23T03:58:00.000Z"),
      expiresAt: new Date("2026-08-23T04:02:00.000Z"),
    });
    const deps = dependencies([
      reaction({
        id: "00000000-0000-4000-8000-000000000025",
        observedOn: "2026-08-22",
        createdAt: "2026-08-23T03:00:00.000Z",
        updatedAt: "2026-08-23T03:00:00.000Z",
      }),
      reaction({
        id: "00000000-0000-4000-8000-000000000026",
        observedOn: "2026-08-23",
        createdAt: "2026-08-23T04:00:00.001Z",
        updatedAt: "2026-08-23T04:00:00.001Z",
      }),
    ], requestScope, localCutoff);

    const result = await deps.query.execute(requestScope, localCutoff);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reactions.map((item) => item.identity.id)).toEqual(["00000000-0000-4000-8000-000000000025"]);
  });

  it("sorts and digests equivalent histories identically", async () => {
    const first = reaction({ id: "00000000-0000-4000-8000-000000000022", substanceName: "zucchini" });
    const second = reaction({ id: "00000000-0000-4000-8000-000000000023", substanceName: "apple" });
    const a = dependencies([first, second]);
    const b = dependencies([second, first]);

    const left = await a.query.execute(scope(), CUTOFF);
    const right = await b.query.execute(scope(), CUTOFF);

    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(right.reactions).toEqual(left.reactions);
    expect(right.digest).toBe(left.digest);
  });

  it("returns only the minimum projection and freezes the result", async () => {
    const row = { ...reaction(), notes: "private note", recordedBy: ACTOR_ID } as FoodReactionRow & { notes: string; recordedBy: string };
    const deps = dependencies([row]);

    const result = await deps.query.execute(scope(), CUTOFF);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reactions)).toBe(true);
    expect(Object.isFrozen(result.reactions[0])).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/notes|recordedBy|careSpaceId|childId|actorUserId/i);
  });
});
