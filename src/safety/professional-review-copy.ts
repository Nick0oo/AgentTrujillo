import { createHash } from "node:crypto";

import { deepFreeze, type SafetyLocale } from "./message-types";

export type ApprovedProfessionalReviewCopy = Readonly<{
  locale: SafetyLocale;
  text: string;
  messageId: string;
  digestSha256: string;
  approval: "approved" | "synthetic_test_only";
}>;

export type RecommendedPediatricianReference = Readonly<{
  displayName?: string;
  credentialLabel?: string;
}>;

export class ProfessionalReviewCopyError extends Error {
  readonly code: "COPY_INVALID" | "COPY_DIGEST_MISMATCH" | "COPY_NOT_APPROVED";
  constructor(code: ProfessionalReviewCopyError["code"]) { super(code); this.name = "ProfessionalReviewCopyError"; this.code = code; }
}

export function professionalReviewDigest(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const GENERIC_PROFESSIONAL_REVIEW_COPIES: Readonly<Record<SafetyLocale, ApprovedProfessionalReviewCopy>> = Object.freeze({
  "es-CO": { locale: "es-CO", text: "Consulte con un pediatra para revisar esta situación.", messageId: "pediatrician-review-es-co", digestSha256: professionalReviewDigest("Consulte con un pediatra para revisar esta situación."), approval: "synthetic_test_only" },
  "en-US": { locale: "en-US", text: "Consult a pediatrician to review this situation.", messageId: "pediatrician-review-en-us", digestSha256: professionalReviewDigest("Consult a pediatrician to review this situation."), approval: "synthetic_test_only" },
});

export function validateProfessionalReviewCopy(copy: ApprovedProfessionalReviewCopy): ApprovedProfessionalReviewCopy {
  if (copy.approval !== "approved" && copy.approval !== "synthetic_test_only") throw new ProfessionalReviewCopyError("COPY_NOT_APPROVED");
  if (copy.text !== copy.text.trim() || [...copy.text].length > 280 || /https?:\/\/|www\.|[<>`*_\[\]{}]|\b(?:call|phone|contact|book|appointment|notify|doctor reviewed|llam(?:e|ar)|tel[eé]fono|contacto|cita|agenda|notific|revis[oó] el caso)\b/iu.test(copy.text)) throw new ProfessionalReviewCopyError("COPY_INVALID");
  if (professionalReviewDigest(copy.text) !== copy.digestSha256) throw new ProfessionalReviewCopyError("COPY_DIGEST_MISMATCH");
  return deepFreeze({ ...copy });
}
