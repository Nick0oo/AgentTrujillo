import { z } from "zod";

import {
  renderProfessionalReview,
  type ProfessionalReviewDecision,
} from "../safety/professional-review-policy";
import {
  GENERIC_PROFESSIONAL_REVIEW_COPIES,
  validateProfessionalReviewCopy,
} from "../safety/professional-review-copy";

const COPY_VERSION = "professional-review-copy.v1" as const;
const LOCALE = z.enum(["es-CO", "en-US"]);
const REASON = z.enum([
  "rule_unavailable",
  "needs_examination",
  "persistent_or_worsening",
  "outside_basic_scope",
  "uncertain_nonurgent",
]);
const MESSAGE_ID = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/u);
const TEXT = z.string().min(1).max(280).refine((value) => (
  value === value.normalize("NFKC")
    && value === value.trim()
    && !/[\u0000-\u001f\u007f<>`]/u.test(value)
    && !/(?:\b(?:https?|s3|gs|file|javascript|data):|\bon[a-z]+\s*=)/iu.test(value)
), "plain approved text");

const POLICY_RESULT_SCHEMA = z.object({
  mode: z.literal("pediatrician_recommendation"),
  reasonCode: REASON,
  publicResponse: z.object({
    type: z.literal("pediatrician_recommendation"),
    text: TEXT,
    locale: LOCALE,
    messageId: MESSAGE_ID,
  }).strict(),
}).strict();

const APPROVED_COPY = Object.freeze({
  "es-CO": validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES["es-CO"]),
  "en-US": validateProfessionalReviewCopy(GENERIC_PROFESSIONAL_REVIEW_COPIES["en-US"]),
});

export const PROFESSIONAL_RECOMMENDATION_SCHEMA = z.object({
  kind: z.literal("professional_recommendation"),
  version: z.literal("professional.recommendation.v1"),
  data: z.object({
    contentType: z.literal("text/professional.recommendation.v1"),
    locale: LOCALE,
    reasonCode: REASON,
    copy: z.object({
      id: MESSAGE_ID,
      version: z.literal(COPY_VERSION),
    }).strict(),
    text: TEXT,
    screenReaderText: TEXT,
    fallbackText: TEXT,
  }).strict(),
}).strict().superRefine((value, context) => {
  const approved = APPROVED_COPY[value.data.locale];
  if (value.data.copy.id !== approved.messageId) {
    context.addIssue({ code: "custom", path: ["data", "copy", "id"], message: "copy id drift" });
  }
  for (const key of ["text", "screenReaderText", "fallbackText"] as const) {
    if (value.data[key] !== approved.text) {
      context.addIssue({ code: "custom", path: ["data", key], message: "copy text drift" });
    }
  }
});

export type ProfessionalRecommendation = Readonly<z.infer<typeof PROFESSIONAL_RECOMMENDATION_SCHEMA>>;

export class ProfessionalRecommendationPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Professional recommendation presentation contract invalid");
    this.name = "ProfessionalRecommendationPresentationError";
  }
}

function fail(): never {
  throw new ProfessionalRecommendationPresentationError();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function presentProfessionalRecommendation(
  rawPolicyResult: unknown,
  rawLocale: unknown,
): ProfessionalRecommendation {
  const policy = POLICY_RESULT_SCHEMA.safeParse(rawPolicyResult);
  const locale = LOCALE.safeParse(rawLocale);
  if (!policy.success || !locale.success || policy.data.publicResponse.locale !== locale.data) return fail();

  let expected: ProfessionalReviewDecision;
  try {
    expected = renderProfessionalReview(policy.data.reasonCode, locale.data);
  } catch {
    return fail();
  }
  if (expected.mode !== "pediatrician_recommendation"
    || expected.publicResponse.type !== policy.data.publicResponse.type
    || expected.publicResponse.locale !== policy.data.publicResponse.locale
    || expected.publicResponse.messageId !== policy.data.publicResponse.messageId
    || expected.publicResponse.text !== policy.data.publicResponse.text) return fail();

  const candidate = {
    kind: "professional_recommendation" as const,
    version: "professional.recommendation.v1" as const,
    data: {
      contentType: "text/professional.recommendation.v1" as const,
      locale: locale.data,
      reasonCode: policy.data.reasonCode,
      copy: {
        id: expected.publicResponse.messageId,
        version: COPY_VERSION,
      },
      text: expected.publicResponse.text,
      screenReaderText: expected.publicResponse.text,
      fallbackText: expected.publicResponse.text,
    },
  };
  const parsed = PROFESSIONAL_RECOMMENDATION_SCHEMA.safeParse(candidate);
  if (!parsed.success) return fail();
  return deepFreeze(parsed.data);
}
