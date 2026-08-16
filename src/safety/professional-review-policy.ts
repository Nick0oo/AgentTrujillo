import { deepFreeze, type SafetyDecision, type SafetyLocale } from "./message-types";
import { GENERIC_PROFESSIONAL_REVIEW_COPIES, validateProfessionalReviewCopy, type RecommendedPediatricianReference } from "./professional-review-copy";

export type ProfessionalReviewReason = "rule_unavailable" | "needs_examination" | "persistent_or_worsening" | "outside_basic_scope" | "uncertain_nonurgent";

export type ProfessionalReviewPublicResponse = Readonly<{
  type: "pediatrician_recommendation";
  text: string;
  locale: SafetyLocale;
  messageId: string;
}>;

export type ProfessionalReviewDecision = Readonly<{
  mode: "pediatrician_recommendation";
  reasonCode: ProfessionalReviewReason;
  publicResponse: ProfessionalReviewPublicResponse;
}> | Readonly<{
  mode: "urgent_precedence";
}>;

export type ProfessionalReviewContext = Readonly<{
  reasonCode: ProfessionalReviewReason;
  locale: SafetyLocale;
  safetyDecision: SafetyDecision;
}>;

const reasons: readonly ProfessionalReviewReason[] = ["rule_unavailable", "needs_examination", "persistent_or_worsening", "outside_basic_scope", "uncertain_nonurgent"];

export function shouldRecommendPediatrician(context: ProfessionalReviewContext): boolean {
  return context.safetyDecision.decision !== "urgent" && reasons.includes(context.reasonCode);
}

export function renderProfessionalReview(
  reasonCode: ProfessionalReviewReason,
  locale: SafetyLocale,
  safetyDecision: SafetyDecision = { decision: "professional_review", responseMode: "pediatrician_recommendation", reasonCode },
  reference?: RecommendedPediatricianReference,
): ProfessionalReviewDecision {
  if (safetyDecision.decision === "urgent") return Object.freeze({ mode: "urgent_precedence" });
  if (!reasons.includes(reasonCode)) throw new Error("INVALID_PROFESSIONAL_REVIEW_REASON");
  if (reference && (Object.keys(reference).some((key) => !["displayName", "credentialLabel"].includes(key)) || reference.displayName || reference.credentialLabel)) throw new Error("UNAPPROVED_PROVIDER_REFERENCE");
  const copy = validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES[locale]);
  return deepFreeze({ mode: "pediatrician_recommendation", reasonCode, publicResponse: deepFreeze({ type: "pediatrician_recommendation", text: copy.text, locale: copy.locale, messageId: copy.messageId }) });
}
