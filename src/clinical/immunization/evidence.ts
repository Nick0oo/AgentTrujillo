import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { Sha256Hex } from "../governance/source-types.ts";
import type { AdministrationDraft, AdministrationScope, VaccineAdministrationCommand, VaccineEvidence } from "./types.ts";

export type ConfirmationSnapshot = Readonly<{
  draftId: string;
  scope: AdministrationScope;
  evidence: VaccineEvidence;
  extracted: VaccineAdministrationCommand;
  confirmationDigest: Sha256Hex;
  expiresAt: string | null;
}>;

export type AdministrationDraftDecision = Readonly<{
  status: "draft" | "confirmed" | "rejected" | "superseded";
  reasonCode: string;
}>;

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(canonicalize(value)).digest("hex") as Sha256Hex;
}

export function computeConfirmationDigest(scope: AdministrationScope, evidence: VaccineEvidence, extracted: VaccineAdministrationCommand, expiresAt: string | null): Sha256Hex {
  return digest({ scope, evidence, extracted, expiresAt });
}

export function createAdministrationDraft(scope: AdministrationScope, evidence: VaccineEvidence, extraction: VaccineAdministrationCommand): AdministrationDraft {
  const expiresAt = evidence.expiresAt;
  const confirmationDigest = computeConfirmationDigest(scope, evidence, extraction, expiresAt);
  return Object.freeze({ draftId: `draft-${confirmationDigest.slice(0, 32)}`, scope, evidence, extracted: extraction, confirmationDigest, expiresAt });
}

export function buildAdministrationConfirmationSnapshot(draft: AdministrationDraft): ConfirmationSnapshot {
  const confirmationDigest = computeConfirmationDigest(draft.scope, draft.evidence, draft.extracted, draft.expiresAt);
  if (confirmationDigest !== draft.confirmationDigest) throw new Error("DRAFT_CONFIRMATION_DIGEST_MISMATCH");
  return Object.freeze({ draftId: draft.draftId, scope: draft.scope, evidence: draft.evidence, extracted: draft.extracted, confirmationDigest, expiresAt: draft.expiresAt });
}
