import { describe, expect, it } from "vitest";

import {
  evaluateDevelopmentAttachment,
  type DevelopmentAttachmentEvidence,
  type DevelopmentAttachmentPolicy,
} from "../../../src/clinical/development/attachment-policy.ts";
import {
  createAuthorizedChildScopeFromTrustedRow,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { Sha256Hex } from "../../../src/clinical/governance/source-types.ts";

const NOW = new Date("2026-08-22T17:00:00.000Z");
const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const CARE_SPACE_ID = "00000000-0000-4000-8000-000000000002";
const CHILD_ID = "00000000-0000-4000-8000-000000000003";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000004";
const DIGEST = "a".repeat(64) as Sha256Hex;
const OTHER_DIGEST = "b".repeat(64) as Sha256Hex;
const OBJECT_PATH = `${CARE_SPACE_ID}/${CHILD_ID}/${DOCUMENT_ID}/${"c".repeat(32)}`;

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
    permissions: ["manage_documents", "record"],
    countryOfCare: "CO",
    timezone: "America/Bogota",
    authorizationVersion: "m:1:a:1",
    issuedAt: new Date("2026-08-22T16:59:00.000Z"),
    expiresAt: new Date("2026-08-22T17:04:00.000Z"),
    ...overrides,
  });
}

function policy(overrides: Partial<DevelopmentAttachmentPolicy> = {}): DevelopmentAttachmentPolicy {
  return {
    policyId: "development-attachment-policy",
    policyVersion: "1.0.0",
    artifactSha256: DIGEST,
    current: true,
    revoked: false,
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    maximumSizeBytes: 20_971_520,
    allowedMediaTypes: ["application/pdf", "image/jpeg", "image/png"],
    allowedRetentionClasses: ["guardian_controlled"],
    ...overrides,
  };
}

function evidence(overrides: Partial<DevelopmentAttachmentEvidence> = {}): DevelopmentAttachmentEvidence {
  return {
    documentId: DOCUMENT_ID,
    careSpaceId: CARE_SPACE_ID,
    childId: CHILD_ID,
    uploadedBy: ACTOR_ID,
    purpose: "development_observation",
    storage: {
      bucket: "clinical-attachments",
      objectPath: OBJECT_PATH,
      visibility: "private",
      permanentUrl: null,
    },
    content: {
      declaredMediaType: "image/png",
      detectedMediaType: "image/png",
      expectedSizeBytes: 100,
      actualSizeBytes: 100,
      expectedSha256: DIGEST,
      actualSha256: DIGEST,
    },
    ticket: {
      audience: "private_upload",
      purpose: "development_observation",
      state: "consumed",
      issuedAt: "2026-08-22T16:59:00.000Z",
      expiresAt: "2026-08-22T17:01:00.000Z",
      consumedAt: "2026-08-22T16:59:30.000Z",
      upsert: false,
      nonceSha256: OTHER_DIGEST,
      scopeProofSha256: DIGEST,
    },
    scan: {
      state: "clean",
      engineId: "synthetic-malware-scanner",
      engineVersion: "1.0.0",
      signatureVersion: "2026.08.22",
      scannedAt: "2026-08-22T16:59:45.000Z",
      reportSha256: OTHER_DIGEST,
    },
    processingState: "clean",
    consent: {
      consentType: "clinical_attachment",
      status: "granted",
      version: "1.0.0",
      decisionAt: "2026-08-22T16:58:00.000Z",
      expiresAt: null,
      revokedAt: null,
      recordSha256: DIGEST,
    },
    retention: {
      class: "guardian_controlled",
      retainUntil: "2027-08-22",
      policyId: "document-retention",
      policyVersion: "1.0.0",
      policySha256: OTHER_DIGEST,
      current: true,
      revoked: false,
      effectiveFrom: "2026-01-01",
      effectiveUntil: null,
    },
    lifecycle: {
      state: "active",
      deletedAt: null,
    },
    ...overrides,
  };
}

function evaluate(
  attachment = evidence(),
  revalidatedScope: AuthorizedChildScope | null = scope(),
  activePolicy = policy(),
) {
  return evaluateDevelopmentAttachment(scope(), attachment, {
    cutoff: NOW,
    revalidatedScope,
    policy: activePolicy,
  });
}

describe("development attachment policy", () => {
  it("allows one private same-child hash-verified clean attachment with bounded provenance", () => {
    const result = evaluate();

    expect(result).toMatchObject({ ok: true, disposition: "allowed", documentId: DOCUMENT_ID });
    if (!result.ok) return;
    expect(result.attachment).toEqual({
      bucket: "clinical-attachments",
      objectPath: OBJECT_PATH,
      digest: DIGEST,
      mime: "image/png",
      size: 100,
      state: "clean",
    });
    expect(result.proof).toMatchObject({
      bucket: "clinical-attachments",
      objectPath: OBJECT_PATH,
      contentDigest: DIGEST,
      mime: "image/png",
      size: 100,
      state: "clean",
      status: "authorized_private",
      current: true,
      revoked: false,
      scopeProofSha256: DIGEST,
    });
    expect(result.provenance).toMatchObject({
      policyId: "development-attachment-policy",
      policyVersion: "1.0.0",
      policySha256: DIGEST,
      retentionPolicyId: "document-retention",
      retentionPolicyVersion: "1.0.0",
      retentionPolicySha256: OTHER_DIGEST,
      scanEngineId: "synthetic-malware-scanner",
      scanEngineVersion: "1.0.0",
    });
    expect(result.decisionSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\//i);
    expect(JSON.stringify(result)).not.toMatch(/milestone.*(?:pass|score|achiev)|diagnos/i);
  });

  it("is deterministic for equivalent trusted evidence", () => {
    const first = evaluate();
    const second = evaluate(structuredClone(evidence()));

    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("keeps the authorization proof stable across fresh valid revalidation cutoffs", () => {
    const first = evaluate();
    const second = evaluateDevelopmentAttachment(scope(), evidence(), {
      cutoff: new Date("2026-08-22T17:00:30.000Z"),
      revalidatedScope: scope(),
      policy: policy(),
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.proof.authorizationProofSha256).toBe(first.proof.authorizationProofSha256);
  });

  it.each([
    ["revoked", null],
    ["sibling", scope({ childId: "00000000-0000-4000-8000-000000000005" })],
    ["foreign space", scope({ careSpaceId: "00000000-0000-4000-8000-000000000006" })],
    ["actor drift", scope({ actorUserId: "00000000-0000-4000-8000-000000000007" })],
    ["timezone drift", scope({ timezone: "UTC" })],
    ["permission widening", scope({ permissions: ["manage_documents", "record", "read"] })],
  ] as const)("denies %s revalidated scope", (_label, revalidatedScope) => {
    expect(evaluate(evidence(), revalidatedScope)).toEqual({
      ok: false,
      disposition: "denied",
      reasonCodes: ["SCOPE_MISMATCH"],
    });
  });

  it("denies evidence owned by a sibling, foreign space, or different actor", () => {
    expect(evaluate(evidence({ childId: "00000000-0000-4000-8000-000000000005" }))).toMatchObject({ reasonCodes: ["SCOPE_MISMATCH", "OBJECT_PATH_INVALID"] });
    expect(evaluate(evidence({ careSpaceId: "00000000-0000-4000-8000-000000000006" }))).toMatchObject({ reasonCodes: ["SCOPE_MISMATCH", "OBJECT_PATH_INVALID"] });
    expect(evaluate(evidence({ uploadedBy: "00000000-0000-4000-8000-000000000007" }))).toMatchObject({ reasonCodes: ["SCOPE_MISMATCH"] });
  });

  it("denies public access, permanent URLs, wrong buckets, and non-opaque paths", () => {
    expect(evaluate(evidence({ storage: { ...evidence().storage, visibility: "public" } }))).toMatchObject({ reasonCodes: ["PUBLIC_ACCESS_FORBIDDEN"] });
    expect(evaluate(evidence({ storage: { ...evidence().storage, permanentUrl: "https://example.invalid/object" } }))).toMatchObject({ reasonCodes: ["PUBLIC_ACCESS_FORBIDDEN"] });
    expect(evaluate(evidence({ storage: { ...evidence().storage, bucket: "generated-reports" as never } }))).toMatchObject({ reasonCodes: ["PUBLIC_ACCESS_FORBIDDEN"] });
    expect(evaluate(evidence({ storage: { ...evidence().storage, objectPath: `${CARE_SPACE_ID}/${CHILD_ID}/../photo.png` } }))).toMatchObject({ reasonCodes: ["INVALID_EVIDENCE"] });
  });

  it("denies expired, unconsumed, wrong-purpose, or upsert upload tickets", () => {
    expect(evaluate(evidence({ ticket: { ...evidence().ticket, expiresAt: NOW.toISOString() } }))).toMatchObject({ reasonCodes: ["TICKET_EXPIRED"] });
    expect(evaluate(evidence({ ticket: { ...evidence().ticket, state: "issued" } }))).toMatchObject({ reasonCodes: ["TICKET_INVALID"] });
    expect(evaluate(evidence({ ticket: { ...evidence().ticket, purpose: "clinical_memory" } }))).toMatchObject({ reasonCodes: ["PURPOSE_MISMATCH"] });
    expect(evaluate(evidence({ ticket: { ...evidence().ticket, upsert: true } }))).toMatchObject({ reasonCodes: ["TICKET_INVALID"] });
  });

  it("denies declared/detected media, size, or checksum mismatch", () => {
    expect(evaluate(evidence({ content: { ...evidence().content, detectedMediaType: "image/jpeg" } }))).toMatchObject({ reasonCodes: ["MEDIA_TYPE_MISMATCH"] });
    expect(evaluate(evidence({ content: { ...evidence().content, actualSizeBytes: 101 } }))).toMatchObject({ reasonCodes: ["SIZE_MISMATCH"] });
    expect(evaluate(evidence({ content: { ...evidence().content, actualSha256: OTHER_DIGEST } }))).toMatchObject({ reasonCodes: ["HASH_MISMATCH"] });
  });

  it("denies unsupported or oversized content even when metadata agrees", () => {
    expect(evaluate(evidence({ content: { ...evidence().content, declaredMediaType: "image/gif" as never, detectedMediaType: "image/gif" as never } }))).toMatchObject({ reasonCodes: ["INVALID_EVIDENCE"] });
    expect(evaluate(evidence({ content: { ...evidence().content, expectedSizeBytes: 20_971_521, actualSizeBytes: 20_971_521 } }))).toMatchObject({ reasonCodes: ["SIZE_NOT_ALLOWED"] });
  });

  it("denies rejected, missing, stale, or future scan evidence", () => {
    expect(evaluate(evidence({ scan: { ...evidence().scan, state: "rejected" } }))).toMatchObject({ reasonCodes: ["SCAN_REJECTED"] });
    expect(evaluate(evidence({ scan: { ...evidence().scan, state: "unavailable" } }))).toMatchObject({ reasonCodes: ["SCAN_UNAVAILABLE"] });
    expect(evaluate(evidence({ scan: { ...evidence().scan, scannedAt: "2026-08-22T17:00:00.001Z" } }))).toMatchObject({ reasonCodes: ["SCAN_INVALID"] });
    expect(evaluate(evidence({ processingState: "pending" }))).toMatchObject({ reasonCodes: ["SCAN_UNAVAILABLE"] });
  });

  it("denies missing, expired, revoked, or future consent", () => {
    expect(evaluate(evidence({ consent: { ...evidence().consent, status: "missing" } }))).toMatchObject({ reasonCodes: ["CONSENT_REQUIRED"] });
    expect(evaluate(evidence({ consent: { ...evidence().consent, status: "revoked", revokedAt: "2026-08-22T16:59:00.000Z" } }))).toMatchObject({ reasonCodes: ["CONSENT_REVOKED"] });
    expect(evaluate(evidence({ consent: { ...evidence().consent, expiresAt: NOW.toISOString() } }))).toMatchObject({ reasonCodes: ["CONSENT_EXPIRED"] });
    expect(evaluate(evidence({ consent: { ...evidence().consent, decisionAt: "2026-08-22T17:00:00.001Z" } }))).toMatchObject({ reasonCodes: ["CONSENT_INVALID"] });
  });

  it("denies expired retention, unavailable policy, and unknown retention class", () => {
    expect(evaluate(evidence({ retention: { ...evidence().retention, retainUntil: "2026-08-21" } }))).toMatchObject({ reasonCodes: ["RETENTION_INVALID"] });
    expect(evaluate(evidence(), scope(), policy({ revoked: true }))).toMatchObject({ reasonCodes: ["POLICY_UNAVAILABLE"] });
    expect(evaluate(evidence({ retention: { ...evidence().retention, class: "permanent" as never } }))).toMatchObject({ reasonCodes: ["INVALID_EVIDENCE"] });
  });

  it("denies revoked retention-policy provenance", () => {
    const result = evaluate({
      ...evidence(),
      retention: { ...evidence().retention, current: false, revoked: true },
    } as never);

    expect(result).toMatchObject({ reasonCodes: ["RETENTION_INVALID"] });
  });

  it("denies deleted, quarantined, or failed lifecycle evidence", () => {
    expect(evaluate(evidence({ lifecycle: { state: "deleted", deletedAt: "2026-08-22T16:59:00.000Z" } }))).toMatchObject({ reasonCodes: ["DOCUMENT_INACTIVE"] });
    expect(evaluate(evidence({ lifecycle: { state: "quarantined", deletedAt: null } }))).toMatchObject({ reasonCodes: ["DOCUMENT_INACTIVE"] });
    expect(evaluate(evidence({ processingState: "failed" }))).toMatchObject({ reasonCodes: ["SCAN_UNAVAILABLE"] });
  });

  it("rejects unknown trusted fields instead of accepting URL or authority injection", () => {
    expect(evaluate({ ...evidence(), publicUrl: "https://example.invalid/object" } as never)).toEqual({ ok: false, disposition: "denied", reasonCodes: ["INVALID_EVIDENCE"] });
    expect(evaluate({ ...evidence(), countryOfCare: "US" } as never)).toEqual({ ok: false, disposition: "denied", reasonCodes: ["INVALID_EVIDENCE"] });
  });
});
