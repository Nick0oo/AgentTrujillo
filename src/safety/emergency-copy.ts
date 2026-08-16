import { createHash } from "node:crypto";

import { deepFreeze, isWellFormedUnicode, type ApprovedEmergencyCopyKey, type SafetyLocale } from "./message-types";
import { emergencyPublicResponseSchema, type EmergencyPublicResponse } from "./emergency-response-schema";

export type ApprovedEmergencyCopy = Readonly<{
  key: ApprovedEmergencyCopyKey;
  locale: SafetyLocale;
  text: string;
  screenReaderText: string;
  messageId: string;
  version: "emergency-copy-v1";
  digestSha256: string;
  approval: "approved" | "synthetic_test_only";
}>;

export type EmergencyCopyBundle = Readonly<{
  copies: readonly ApprovedEmergencyCopy[];
  approval: "approved" | "synthetic_test_only";
}>;

export class EmergencyCopyError extends Error {
  readonly code: "COPY_UNAVAILABLE" | "COPY_NOT_APPROVED" | "COPY_INVALID" | "COPY_DIGEST_MISMATCH" | "COPY_LOCALE_MISMATCH";

  constructor(code: EmergencyCopyError["code"]) {
    super(code);
    this.name = "EmergencyCopyError";
    this.code = code;
  }
}

export function digestEmergencyCopy(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function validateEmergencyCopy(copy: ApprovedEmergencyCopy): ApprovedEmergencyCopy {
  if (copy.approval !== "approved" && copy.approval !== "synthetic_test_only") throw new EmergencyCopyError("COPY_NOT_APPROVED");
  if (!isWellFormedUnicode(copy.text) || copy.text !== copy.text.trim() || copy.text.length === 0 || [...copy.text].length > 280) throw new EmergencyCopyError("COPY_INVALID");
  if (copy.screenReaderText !== copy.text || !isWellFormedUnicode(copy.screenReaderText)) throw new EmergencyCopyError("COPY_INVALID");
  if (/[\r\n\t]|[<>`*_\[\]{}]|https?:\/\/|www\.|\b(?:call|phone|contact|map|address|book|appointment|doctor|diagnos|treat|medic|dose|monitor|wait|safe|reassur|llam|tel[eé]fono|contact|mapa|direcci[oó]n|cita|doctor|diagn[oó]st|trat|medic|dosis|vigila|espere|segur)\b/iu.test(copy.text)) throw new EmergencyCopyError("COPY_INVALID");
  if (copy.locale === "es-CO" && !/^Acudan directamente al servicio de urgencias\.$/u.test(copy.text)) throw new EmergencyCopyError("COPY_INVALID");
  if (copy.locale === "en-US" && !/^Go directly to the emergency department\.$/u.test(copy.text)) throw new EmergencyCopyError("COPY_INVALID");
  if (digestEmergencyCopy(copy.text) !== copy.digestSha256) throw new EmergencyCopyError("COPY_DIGEST_MISMATCH");
  if (!/^emergency-[a-z0-9_.-]{1,96}$/.test(copy.messageId)) throw new EmergencyCopyError("COPY_INVALID");
  return deepFreeze({ ...copy });
}

export function resolveEmergencyCopy(bundle: EmergencyCopyBundle, key: ApprovedEmergencyCopyKey, locale: SafetyLocale): ApprovedEmergencyCopy {
  const copy = bundle.copies.find((candidate) => candidate.key === key);
  if (!copy) throw new EmergencyCopyError("COPY_UNAVAILABLE");
  if (copy.locale !== locale) throw new EmergencyCopyError("COPY_LOCALE_MISMATCH");
  if (bundle.approval !== copy.approval) throw new EmergencyCopyError("COPY_NOT_APPROVED");
  return validateEmergencyCopy(copy);
}

export function renderEmergencyResponse(decision: Readonly<{ decision: "urgent"; responseMode: "emergency_recommendation"; copyKey: ApprovedEmergencyCopyKey }>, copy: ApprovedEmergencyCopy): EmergencyPublicResponse {
  if (decision.responseMode !== "emergency_recommendation" || decision.copyKey !== copy.key) throw new EmergencyCopyError("COPY_INVALID");
  const validated = validateEmergencyCopy(copy);
  const result = emergencyPublicResponseSchema.safeParse({ type: "emergency_recommendation", text: validated.text, locale: validated.locale, messageId: validated.messageId });
  if (!result.success) throw new EmergencyCopyError("COPY_INVALID");
  return deepFreeze(result.data);
}
