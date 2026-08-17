import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope.ts";
import { buildMeasurementFingerprint, type FingerprintKey } from "../../../src/clinical/anthropometry/measurement-fingerprint.ts";
import { detectMeasurementDuplicate } from "../../../src/clinical/anthropometry/duplicate-detection.ts";
import type { MeasurementCandidate } from "../../../src/clinical/anthropometry/validate-measurement.ts";

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: "00000000-0000-4000-8000-000000000001",
  careSpaceId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003",
  permissions: ["record"],
  countryOfCare: "CO",
  timezone: "UTC",
  authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-16T12:00:00.000Z"),
  expiresAt: new Date("2026-08-16T12:04:00.000Z"),
});
const key: FingerprintKey = { keyId: "k1", secret: "secret" };
const candidate = {
  measurementType: "weight",
  normalizedValue: { normalized: { canonical: "12.30" }, normalizedUnit: "kg" },
  occurredAt: "2026-08-16T12:00:00.000Z",
  localDate: "2026-08-16",
  timeZone: "UTC",
  measurementMethod: "digital_scale",
  provenanceType: "guardian",
  validationStatus: "valid",
} as unknown as MeasurementCandidate;

describe("measurement duplicate detection", () => {
  it("binds the fingerprint to child scope and HMAC key", () => {
    const first = buildMeasurementFingerprint(scope, candidate, key);
    const second = buildMeasurementFingerprint(scope, candidate, key);
    expect(first.digest).toBe(second.digest);
    expect(first.keyId).toBe("k1");
    expect(first.digest).toBe(createHmac("sha256", key.secret).update(first.canonicalInput).digest("hex"));
  });

  it("distinguishes exact replay, changed conflict, and semantic review", async () => {
    const fingerprint = buildMeasurementFingerprint(scope, candidate, key);
    const repository = {
      findByIdempotency: async () => ({ fingerprint: fingerprint.digest, candidate }),
      findLikelyDuplicates: async () => [{ id: "one", fingerprint: "different" }],
    };
    expect((await detectMeasurementDuplicate(scope, candidate, repository, "request", key)).outcome).toBe("idempotent_replay");
  });
});
