import { z } from "zod";

import {
  digestEmergencyCopy,
  renderEmergencyResponse,
  resolveEmergencyCopy,
  type ApprovedEmergencyCopy,
  type EmergencyCopyBundle,
} from "../safety/emergency-copy";
import { deepFreeze } from "../safety/message-types";

const LOCALE = z.enum(["es-CO", "en-US"]);
const COPY_KEY = z.enum([
  "emergency_department_es_co_v1",
  "emergency_department_en_us_v1",
]);
const RULE_CODE = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]*$/u);
const DECISION_SCHEMA = z.object({
  decision: z.literal("urgent"),
  responseMode: z.literal("emergency_recommendation"),
  ruleCodes: z.array(RULE_CODE).min(1).max(256).readonly(),
  copyKey: COPY_KEY,
}).strict().superRefine((value, context) => {
  if (new Set(value.ruleCodes).size !== value.ruleCodes.length
    || value.ruleCodes.some((code, index) => index > 0 && value.ruleCodes[index - 1]! >= code)) {
    context.addIssue({ code: "custom", path: ["ruleCodes"], message: "deterministic_rule_codes" });
  }
});

function emergencyCopy(
  locale: "es-CO" | "en-US",
  text: string,
  key: ApprovedEmergencyCopy["key"],
  messageId: string,
): ApprovedEmergencyCopy {
  return deepFreeze({
    key,
    locale,
    text,
    screenReaderText: text,
    messageId,
    version: "emergency-copy-v1",
    digestSha256: digestEmergencyCopy(text),
    approval: "synthetic_test_only",
  });
}

// Exact AT-04-08 synthetic fixtures only; this presenter does not activate a
// governed production copy or create new clinical wording.
const COPY_BUNDLE: EmergencyCopyBundle = deepFreeze({
  approval: "synthetic_test_only",
  copies: [
    emergencyCopy(
      "es-CO",
      "Acudan directamente al servicio de urgencias.",
      "emergency_department_es_co_v1",
      "emergency-es-co",
    ),
    emergencyCopy(
      "en-US",
      "Go directly to the emergency department.",
      "emergency_department_en_us_v1",
      "emergency-en-us",
    ),
  ],
});

const EXACT_TEXT = z.enum([
  "Acudan directamente al servicio de urgencias.",
  "Go directly to the emergency department.",
]);
const MESSAGE_ID = z.enum(["emergency-es-co", "emergency-en-us"]);
const COPY_KEY_BY_LOCALE = Object.freeze({
  "es-CO": "emergency_department_es_co_v1" as const,
  "en-US": "emergency_department_en_us_v1" as const,
});

export const EMERGENCY_RECOMMENDATION_SCHEMA = z.object({
  kind: z.literal("emergency_recommendation"),
  version: z.literal("emergency.recommendation.v1"),
  data: z.object({
    contentType: z.literal("text/emergency.recommendation.v1"),
    terminal: z.literal(true),
    locale: LOCALE,
    copy: z.object({
      id: MESSAGE_ID,
      version: z.literal("emergency-copy-v1"),
    }).strict(),
    text: EXACT_TEXT,
    screenReaderText: EXACT_TEXT,
    fallbackText: EXACT_TEXT,
  }).strict(),
}).strict().superRefine((value, context) => {
  let expected: ApprovedEmergencyCopy;
  try {
    expected = resolveEmergencyCopy(
      COPY_BUNDLE,
      COPY_KEY_BY_LOCALE[value.data.locale],
      value.data.locale,
    );
  } catch {
    context.addIssue({ code: "custom", path: ["data", "copy"], message: "copy_binding" });
    return;
  }
  if (value.data.copy.id !== expected.messageId) {
    context.addIssue({ code: "custom", path: ["data", "copy", "id"], message: "copy_id" });
  }
  for (const key of ["text", "screenReaderText", "fallbackText"] as const) {
    if (value.data[key] !== expected.text) {
      context.addIssue({ code: "custom", path: ["data", key], message: "copy_text" });
    }
  }
});

export type EmergencyRecommendation = Readonly<z.infer<typeof EMERGENCY_RECOMMENDATION_SCHEMA>>;

export class EmergencyRecommendationPresentationError extends Error {
  readonly code = "PRESENTATION_INPUT_INVALID" as const;

  constructor() {
    super("Emergency recommendation presentation contract invalid");
    this.name = "EmergencyRecommendationPresentationError";
  }
}

function fail(): never {
  throw new EmergencyRecommendationPresentationError();
}

export function presentEmergencyRecommendation(
  rawDecision: unknown,
  rawLocale: unknown,
): EmergencyRecommendation {
  const decision = DECISION_SCHEMA.safeParse(rawDecision);
  const locale = LOCALE.safeParse(rawLocale);
  if (!decision.success || !locale.success) return fail();

  let copy: ApprovedEmergencyCopy;
  try {
    copy = resolveEmergencyCopy(COPY_BUNDLE, decision.data.copyKey, locale.data);
  } catch {
    return fail();
  }

  let response;
  try {
    response = renderEmergencyResponse(decision.data, copy);
  } catch {
    return fail();
  }

  const parsed = EMERGENCY_RECOMMENDATION_SCHEMA.safeParse({
    kind: "emergency_recommendation",
    version: "emergency.recommendation.v1",
    data: {
      contentType: "text/emergency.recommendation.v1",
      terminal: true,
      locale: response.locale,
      copy: {
        id: response.messageId,
        version: copy.version,
      },
      text: response.text,
      screenReaderText: response.text,
      fallbackText: response.text,
    },
  });
  if (!parsed.success) return fail();
  return deepFreeze(parsed.data);
}
