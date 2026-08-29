import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f\p{Cf}\p{Cs}]+$/u;

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

const boundedText = (max: number) => z.string().trim().min(1).max(max).regex(SAFE_TEXT);

export const ONBOARDING_REQUEST_SCHEMA = z.object({
  contractVersion: z.literal("onboarding.v1"),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
  careSpace: z.object({ name: boundedText(120) }).strict(),
  child: z.object({
    givenNames: boundedText(120),
    birthDate: z.string().regex(ISO_DATE).refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed <= new Date();
    }),
    referenceSex: z.enum(["female", "male"]),
    countryOfCare: z.enum(["CO", "US"]),
    timezone: z.string().min(3).max(64).refine(validTimezone),
    isPremature: z.boolean(),
    gestationalAgeWeeks: z.number().int().min(20).max(44).nullable(),
    allergies: z.array(boundedText(120)).max(20),
  }).strict().superRefine((value, context) => {
    if (value.isPremature && value.gestationalAgeWeeks === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["gestationalAgeWeeks"], message: "required_for_prematurity" });
    }
    if (!value.isPremature && value.gestationalAgeWeeks !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["gestationalAgeWeeks"], message: "must_be_null_when_not_premature" });
    }
  }),
  guardianRelationship: z.enum(["mother", "father", "grandparent", "guardian", "other"]),
  privacyConsentAccepted: z.literal(true),
}).strict();

export const ONBOARDING_RESPONSE_SCHEMA = z.object({
  contractVersion: z.literal("onboarding.v1"),
  status: z.literal("created"),
  careSpaceId: z.string().uuid(),
  childId: z.string().uuid(),
  resourceVersion: z.number().int().min(1).max(100_000),
}).strict();

export type OnboardingRequest = z.infer<typeof ONBOARDING_REQUEST_SCHEMA>;
export type OnboardingResponse = z.infer<typeof ONBOARDING_RESPONSE_SCHEMA>;

export const ONBOARDING_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "IDEMPOTENCY_CONFLICT",
  "ONBOARDING_ALREADY_EXISTS",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type OnboardingErrorCode = typeof ONBOARDING_ERROR_CODES[number];
