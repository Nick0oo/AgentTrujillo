import { z } from "zod";

import {
  assertTextLimits,
  codePointLength,
  deepFreeze,
  isSafeControlText,
  isSafetyLocale,
  isWellFormedUnicode,
  SAFETY_MESSAGE_LIMITS,
  SafetyInputError,
  type MessageSource,
  type RawGuardianMessage,
  type SafetyLocale,
} from "./message-types";

const requestIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, "invalid request id");
const localeSchema = z.string().refine(isSafetyLocale, "unsupported locale");
const sourceSchema = z.enum(["guardian", "guardian_follow_up"] satisfies readonly [MessageSource, MessageSource]);

export const rawGuardianMessageSchema = z.object({
  text: z.string()
    .refine(isWellFormedUnicode, "text must be well-formed Unicode")
    .refine(isSafeControlText, "text contains an unsupported control character")
    .refine((value) => codePointLength(value) <= SAFETY_MESSAGE_LIMITS.maxCodePoints, "text exceeds code-point limit")
    .refine((value) => new TextEncoder().encode(value).byteLength <= SAFETY_MESSAGE_LIMITS.maxUtf8Bytes, "text exceeds UTF-8 limit"),
  locale: localeSchema,
  source: sourceSchema,
  requestId: requestIdSchema,
}).strict();

export type RawGuardianMessageInput = z.input<typeof rawGuardianMessageSchema>;

function mapSchemaFailure(error: z.ZodError): never {
  const issue = error.issues[0];
  if (issue?.path[0] === "locale") throw new SafetyInputError("UNSUPPORTED_LOCALE");
  if (issue?.path[0] === "requestId") throw new SafetyInputError("INVALID_REQUEST_ID");
  if (issue?.message.includes("code-point") || issue?.message.includes("UTF-8")) throw new SafetyInputError("LIMIT_EXCEEDED");
  if (issue?.message.includes("well-formed")) throw new SafetyInputError("INVALID_ENCODING");
  throw new SafetyInputError("INVALID_TEXT");
}

export function createRawGuardianMessage(input: RawGuardianMessageInput): RawGuardianMessage {
  const result = rawGuardianMessageSchema.safeParse(input);
  if (!result.success) mapSchemaFailure(result.error);
  const parsed = result.data;
  assertTextLimits(parsed.text);
  return deepFreeze({
    text: parsed.text,
    locale: parsed.locale as SafetyLocale,
    source: parsed.source,
    requestId: parsed.requestId,
  });
}

export function parseRawGuardianMessage(input: unknown): RawGuardianMessage {
  const result = rawGuardianMessageSchema.safeParse(input);
  if (!result.success) mapSchemaFailure(result.error);
  return createRawGuardianMessage(result.data);
}

export const safetyLocaleSchema = localeSchema;
export const messageSourceSchema = sourceSchema;
