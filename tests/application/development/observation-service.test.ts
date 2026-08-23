import { describe, expect, it } from "vitest";

import {
  createDevelopmentObservationService,
  type DevelopmentObservationRepository,
  type DevelopmentObservationRepositoryRow,
  type DevelopmentObservationWrite,
} from "../../../src/application/development/observation-service.ts";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { DevelopmentObservationValidationContext } from "../../../src/clinical/development/observation-validation.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";

const NOW = new Date("2026-08-22T17:00:00.000Z");
const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const OBSERVATION_ID = "00000000-0000-4000-8000-000000000004";
const SUCCESSOR_ID = "00000000-0000-4000-8000-000000000005";
const DIGEST = "a".repeat(64) as Sha256Hex;

function scope(overrides: Partial<{
  actorUserId: string;
  careSpaceId: string;
  childId: string;
  permissions: readonly string[];
  countryOfCare: string;
  timezone: string;
  authorizationVersion: string;
  issuedAt: Date;
  expiresAt: Date;
}> = {}): AuthorizedChildScope {
  return createAuthorizedChildScopeFromTrustedRow({
    actorUserId: ACTOR_ID,
    careSpaceId: CARE_SPACE_ID,
    childId: CHILD_ID,
    permissions: ["read", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date("2026-08-22T16:59:00.000Z"),
    expiresAt: new Date("2026-08-22T17:04:00.000Z"),
    ...overrides,
  });
}

function context(overrides: Partial<DevelopmentObservationValidationContext> = {}): DevelopmentObservationValidationContext {
  return {
    cutoff: NOW.toISOString(),
    timeZone: "America/Bogota",
    ageEvidence: {
      ageDays: 182,
      basis: "chronological",
      referenceInstant: NOW.toISOString(),
      timeZone: "America/Bogota",
      algorithmVersion: "chronological-age.v1",
      provenance: {
        provenanceType: "system",
        sourceId: "synthetic-age-evidence",
        sourceDigest: DIGEST,
        observedAt: "2026-08-22T16:59:00.000Z",
      },
    },
    milestoneEvidence: null,
    attachmentProofs: [],
    ...overrides,
  };
}

const draft = {
  text: "  During floor play, the caregiver noticed reaching toward a toy.  ",
  date: "2026-08-22",
  domain: "general" as const,
  source: "guardian" as const,
  concern: null,
  attachments: [],
};

function row(overrides: Partial<DevelopmentObservationRepositoryRow> = {}): DevelopmentObservationRepositoryRow {
  return {
    id: OBSERVATION_ID,
    careSpaceId: CARE_SPACE_ID,
    childId: CHILD_ID,
    recordedBy: ACTOR_ID,
    milestoneCode: null,
    domain: "general",
    title: null,
    observation: "During floor play, the caregiver noticed reaching toward a toy.",
    observedOn: "2026-08-22",
    status: "observed",
    createdAt: "2026-08-22T17:00:00.000Z",
    confirmedAt: "2026-08-22T17:00:00.000Z",
    supersedesObservationId: null,
    ...overrides,
  };
}

function harness(options: Readonly<{
  freshScope?: AuthorizedChildScope | null;
  validationContext?: DevelopmentObservationValidationContext | null;
  recordResult?: Awaited<ReturnType<DevelopmentObservationRepository["record"]>>;
  foundRow?: DevelopmentObservationRepositoryRow | null;
  listedRows?: readonly DevelopmentObservationRepositoryRow[];
  throwFrom?: "transaction" | "context" | "record" | "find" | "list";
}> = {}) {
  const writes: DevelopmentObservationWrite[] = [];
  let contextCalls = 0;
  const repository: DevelopmentObservationRepository = {
    async record(_freshScope, write) {
      if (options.throwFrom === "record") throw new Error("storage unavailable");
      writes.push(write);
      return options.recordResult ?? { ok: true, observationId: OBSERVATION_ID, outcome: "created" };
    },
    async find() {
      if (options.throwFrom === "find") throw new Error("storage unavailable");
      return options.foundRow === undefined ? row() : options.foundRow;
    },
    async list() {
      if (options.throwFrom === "list") throw new Error("storage unavailable");
      return options.listedRows ?? [row()];
    },
  };
  const service = createDevelopmentObservationService({
    transaction: {
      async run(_requestScope, _currentInstant, operation) {
        if (options.throwFrom === "transaction") throw new Error("transaction unavailable");
        const freshScope = options.freshScope === undefined ? scope() : options.freshScope;
        return freshScope === null ? null : operation(freshScope);
      },
    },
    validationContext: {
      async resolve() {
        contextCalls += 1;
        if (options.throwFrom === "context") throw new Error("context unavailable");
        return options.validationContext === undefined ? context() : options.validationContext;
      },
    },
    repository,
  }, { now: () => NOW });
  return { service, writes, get contextCalls() { return contextCalls; } };
}

describe("development observation service", () => {
  it("creates a normalized confirmation-bound draft without persisting it", async () => {
    const test = harness();

    const result = await test.service.createDraft(scope(), draft);

    expect(result).toMatchObject({ ok: true, status: "draft", warnings: [] });
    if (!result.ok || result.status !== "draft") return;
    expect(result.preview.draft.text).toBe("During floor play, the caregiver noticed reaching toward a toy.");
    expect(result.preview.draft.source).toBe("caregiver");
    expect(result.preview.draftId).toMatch(/^[a-f0-9]{64}$/);
    expect(result.preview.confirmationDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.preview).not.toHaveProperty("confirmationMaterial");
    expect(JSON.stringify(result)).not.toContain(ACTOR_ID);
    expect(JSON.stringify(result)).not.toContain(CARE_SPACE_ID);
    expect(JSON.stringify(result)).not.toContain(CHILD_ID);
    expect(test.writes).toEqual([]);
  });

  it("rejects clinical interpretation and unknown authority fields before persistence", async () => {
    const test = harness();

    const clinical = await test.service.createDraft(scope(), { ...draft, text: "The child has developmental delay." });
    const forged = await test.service.createDraft(scope(), { ...draft, childId: CHILD_ID } as never);

    expect(clinical).toEqual({ ok: false, status: "unavailable", code: "INVALID_OBSERVATION" });
    expect(forged).toEqual({ ok: false, status: "unavailable", code: "INVALID_OBSERVATION" });
    expect(test.writes).toEqual([]);
  });

  it("revalidates and records exactly the confirmed preview", async () => {
    const test = harness();
    const preview = await test.service.createDraft(scope(), draft);
    if (!preview.ok || preview.status !== "draft") throw new Error("expected draft");

    const result = await test.service.confirm(scope(), {
      preview: preview.preview,
      confirmationDigest: preview.preview.confirmationDigest,
      idempotencyKey: "observation-1",
    });

    expect(result).toEqual({ ok: true, status: "recorded", observationId: OBSERVATION_ID, outcome: "created" });
    expect(test.writes).toEqual([{
      milestoneCode: null,
      domain: "general",
      title: null,
      observation: "During floor play, the caregiver noticed reaching toward a toy.",
      observedOn: "2026-08-22",
      status: "observed",
      provenanceType: "guardian",
      idempotencyKey: "observation-1",
      inputSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      confirmationSha256: preview.preview.confirmationDigest,
      supersedesObservationId: null,
      attachmentObjectPaths: [],
    }]);
    expect(test.contextCalls).toBe(2);
  });

  it("returns the same public outcome for an identical repository replay", async () => {
    const test = harness({ recordResult: { ok: true, observationId: OBSERVATION_ID, outcome: "idempotent_replay" } });
    const preview = await test.service.createDraft(scope(), draft);
    if (!preview.ok || preview.status !== "draft") throw new Error("expected draft");

    const result = await test.service.confirm(scope(), {
      preview: preview.preview,
      confirmationDigest: preview.preview.confirmationDigest,
      idempotencyKey: "observation-replay",
    });

    expect(result).toEqual({ ok: true, status: "recorded", observationId: OBSERVATION_ID, outcome: "idempotent_replay" });
  });

  it("rejects preview drift and replay conflicts without reporting success", async () => {
    const drift = harness();
    const preview = await drift.service.createDraft(scope(), draft);
    if (!preview.ok || preview.status !== "draft") throw new Error("expected draft");
    const changedPreview = { ...preview.preview, draft: { ...preview.preview.draft, text: "A different neutral observation." } };
    const drifted = await drift.service.confirm(scope(), {
      preview: changedPreview,
      confirmationDigest: preview.preview.confirmationDigest,
      idempotencyKey: "observation-drift",
    });

    const conflict = harness({ recordResult: { ok: false, code: "IDEMPOTENCY_CONFLICT" } });
    const conflictPreview = await conflict.service.createDraft(scope(), draft);
    if (!conflictPreview.ok || conflictPreview.status !== "draft") throw new Error("expected draft");
    const conflicted = await conflict.service.confirm(scope(), {
      preview: conflictPreview.preview,
      confirmationDigest: conflictPreview.preview.confirmationDigest,
      idempotencyKey: "observation-conflict",
    });

    expect(drifted).toEqual({ ok: false, status: "unavailable", code: "CONFIRMATION_DRIFT" });
    expect(drift.writes).toEqual([]);
    expect(conflicted).toEqual({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" });
  });

  it("fails closed on revoked, sibling, foreign-space, timezone, or widened scopes", async () => {
    const cases = [
      null,
      scope({ childId: "00000000-0000-4000-8000-000000000006" }),
      scope({ careSpaceId: "00000000-0000-4000-8000-000000000007" }),
      scope({ timezone: "UTC" }),
      scope({ permissions: ["read", "record", "manage_documents"] }),
    ];

    for (const freshScope of cases) {
      const test = harness({ freshScope });
      expect(await test.service.createDraft(scope(), draft)).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
      expect(test.contextCalls).toBe(0);
      expect(test.writes).toEqual([]);
    }
  });

  it("rejects attachment evidence mismatch before confirmation", async () => {
    const test = harness();
    const result = await test.service.createDraft(scope(), {
      ...draft,
      attachments: [{
        bucket: "clinical-attachments" as const,
        objectPath: "opaque/observation.png",
        digest: DIGEST,
        mime: "image/png" as const,
        size: 100,
        state: "clean" as const,
      }],
    });

    expect(result).toEqual({ ok: false, status: "unavailable", code: "INVALID_OBSERVATION" });
    expect(test.writes).toEqual([]);
  });

  it("records a correction only after loading an exact same-scope predecessor", async () => {
    const test = harness();
    const preview = await test.service.createDraft(scope(), { ...draft, text: "The caregiver noticed reaching twice." });
    if (!preview.ok || preview.status !== "draft") throw new Error("expected draft");

    const result = await test.service.correct(scope(), OBSERVATION_ID, {
      preview: preview.preview,
      confirmationDigest: preview.preview.confirmationDigest,
      idempotencyKey: "observation-correction",
    });

    expect(result).toEqual({ ok: true, status: "recorded", observationId: OBSERVATION_ID, outcome: "created" });
    expect(test.writes[0]?.supersedesObservationId).toBe(OBSERVATION_ID);

    const foreign = harness({ foundRow: row({ childId: "00000000-0000-4000-8000-000000000006" }) });
    const foreignPreview = await foreign.service.createDraft(scope(), draft);
    if (!foreignPreview.ok || foreignPreview.status !== "draft") throw new Error("expected draft");
    expect(await foreign.service.correct(scope(), OBSERVATION_ID, {
      preview: foreignPreview.preview,
      confirmationDigest: foreignPreview.preview.confirmationDigest,
      idempotencyKey: "foreign-correction",
    })).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(foreign.writes).toEqual([]);
  });

  it("previews and confirms an append-only governed withdrawal", async () => {
    const test = harness({ recordResult: { ok: true, observationId: SUCCESSOR_ID, outcome: "created" } });
    const proposed = await test.service.governedDelete(scope(), {
      observationId: OBSERVATION_ID,
      reason: "entered_by_mistake",
    });

    expect(proposed).toMatchObject({ ok: true, status: "confirmation_required" });
    if (!proposed.ok || proposed.status !== "confirmation_required") return;
    expect(test.writes).toEqual([]);

    const result = await test.service.governedDelete(scope(), {
      observationId: OBSERVATION_ID,
      reason: "entered_by_mistake",
      confirmationDigest: proposed.confirmationDigest,
      idempotencyKey: "withdraw-observation",
    });

    expect(result).toEqual({ ok: true, status: "recorded", observationId: SUCCESSOR_ID, outcome: "created" });
    expect(test.writes).toEqual([expect.objectContaining({
      milestoneCode: null,
      domain: "general",
      title: null,
      observation: "Caregiver withdrew this diary entry.",
      observedOn: "2026-08-22",
      status: "entered_in_error",
      provenanceType: "guardian",
      supersedesObservationId: OBSERVATION_ID,
      attachmentObjectPaths: [],
    })]);
  });

  it("rejects withdrawal confirmation drift without creating a successor", async () => {
    const test = harness();
    const proposed = await test.service.governedDelete(scope(), { observationId: OBSERVATION_ID, reason: "wrong_date" });
    if (!proposed.ok || proposed.status !== "confirmation_required") throw new Error("expected confirmation");

    const result = await test.service.governedDelete(scope(), {
      observationId: OBSERVATION_ID,
      reason: "other",
      confirmationDigest: proposed.confirmationDigest,
      idempotencyKey: "withdraw-drift",
    });

    expect(result).toEqual({ ok: false, status: "unavailable", code: "CONFIRMATION_DRIFT" });
    expect(test.writes).toEqual([]);
  });

  it("lists only neutral same-scope rows without authority identifiers", async () => {
    const test = harness({ listedRows: [row(), row({
      id: SUCCESSOR_ID,
      observation: "Caregiver withdrew this diary entry.",
      status: "entered_in_error",
      supersedesObservationId: OBSERVATION_ID,
    })] });

    const result = await test.service.list(scope());

    expect(result).toMatchObject({ ok: true, status: "available" });
    if (!result.ok || result.status !== "available") return;
    expect(result.observations).toHaveLength(2);
    expect(result.observations[1]).toEqual({
      id: SUCCESSOR_ID,
      milestoneCode: null,
      domain: "general",
      title: null,
      observation: "Caregiver withdrew this diary entry.",
      observedOn: "2026-08-22",
      status: "entered_in_error",
      createdAt: "2026-08-22T17:00:00.000Z",
      confirmedAt: "2026-08-22T17:00:00.000Z",
      supersedesObservationId: OBSERVATION_ID,
    });
    expect(JSON.stringify(result)).not.toContain(ACTOR_ID);
    expect(JSON.stringify(result)).not.toContain(CARE_SPACE_ID);
    expect(JSON.stringify(result)).not.toContain(CHILD_ID);
  });

  it("fails the whole list on one mixed-scope row and catches port failures", async () => {
    const mixed = harness({ listedRows: [row(), row({ childId: "00000000-0000-4000-8000-000000000006" })] });
    const failing = harness({ throwFrom: "record" });
    const preview = await failing.service.createDraft(scope(), draft);
    if (!preview.ok || preview.status !== "draft") throw new Error("expected draft");

    expect(await mixed.service.list(scope())).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(await failing.service.confirm(scope(), {
      preview: preview.preview,
      confirmationDigest: preview.preview.confirmationDigest,
      idempotencyKey: "rollback-proof",
    })).toEqual({ ok: false, status: "unavailable", code: "STORAGE_UNAVAILABLE" });
    expect(failing.writes).toEqual([]);
  });
});
