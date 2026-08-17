import { createHmac } from "node:crypto";

import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope.ts";
import type { MeasurementCandidate } from "./validate-measurement.ts";

export type FingerprintKey = Readonly<{ keyId: string; secret: string }>;
export type MeasurementFingerprint = Readonly<{ keyId: string; canonicalInput: string; digest: string }>;

export function buildMeasurementFingerprint(
  scope: AuthorizedChildScope,
  candidate: MeasurementCandidate,
  key: FingerprintKey,
): MeasurementFingerprint {
  const canonicalInput = JSON.stringify({
    actorUserId: scope.actorUserId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    authorizationVersion: scope.authorizationVersion,
    ...candidate.fingerprintMaterial,
    validationStatus: candidate.validationStatus,
  });
  const digest = createHmac("sha256", key.secret).update(canonicalInput).digest("hex");
  return Object.freeze({ keyId: key.keyId, canonicalInput, digest });
}
