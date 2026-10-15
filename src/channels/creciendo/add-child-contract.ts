import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f\p{Cf}\p{Cs}]+$/u;
const UUID = z.string().uuid();

function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}

const boundedText = (max: number) => z.string().trim().min(1).max(max).regex(SAFE_TEXT);
const optionalText = (max: number) => boundedText(max).nullable().default(null);

export const ADD_CHILD_REQUEST_SCHEMA = z.object({
  contractVersion: z.literal("add-child.v1"),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/u),
  careSpaceId: UUID,
  child: z.object({
    givenNames: boundedText(120), familyNames: optionalText(120), preferredName: optionalText(80),
    birthDate: z.string().regex(ISO_DATE).refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed <= new Date();
    }),
    timeOfBirth: z.string().regex(LOCAL_TIME).nullable().default(null),
    birthTimeZone: z.string().min(3).max(64).refine(validTimezone).nullable().default(null),
    referenceSex: z.enum(["female", "male"]), countryOfCare: z.enum(["CO", "US"]),
    timezone: z.string().min(3).max(64).refine(validTimezone), isPremature: z.boolean(),
    gestationalAgeWeeks: z.number().int().min(20).max(44).nullable(),
    gestationalAgeDays: z.number().int().min(0).max(6).nullable().default(null),
    birthWeightGrams: z.number().min(200).max(8_000).nullable().default(null),
    allergies: z.array(boundedText(120)).max(20),
  }).strict().superRefine((value, context) => {
    if (value.isPremature && value.gestationalAgeWeeks === null) context.addIssue({ code: z.ZodIssueCode.custom, path: ["gestationalAgeWeeks"], message: "required_for_prematurity" });
    if (!value.isPremature && (value.gestationalAgeWeeks !== null || value.gestationalAgeDays !== null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["gestationalAgeWeeks"], message: "must_be_null_when_not_premature" });
    if ((value.timeOfBirth === null) !== (value.birthTimeZone === null)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["birthTimeZone"], message: "birth_time_requires_timezone" });
  }),
  privacyConsentAccepted: z.literal(true),
}).strict();

export const ADD_CHILD_RESPONSE_SCHEMA = z.object({
  contractVersion: z.literal("add-child.v1"), status: z.literal("created"), careSpaceId: UUID,
  childId: UUID, resourceVersion: z.number().int().min(1).max(100_000),
}).strict();

export type AddChildRequest = z.infer<typeof ADD_CHILD_REQUEST_SCHEMA>;
export type AddChildResponse = z.infer<typeof ADD_CHILD_RESPONSE_SCHEMA>;
export const ADD_CHILD_ERROR_CODES = ["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "IDEMPOTENCY_CONFLICT", "CONSENT_REQUIRED", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR"] as const;
export type AddChildErrorCode = typeof ADD_CHILD_ERROR_CODES[number];
