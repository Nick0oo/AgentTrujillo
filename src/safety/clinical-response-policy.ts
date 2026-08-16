import { deepFreeze, type SafetyDecision, type SafetyLocale } from "./message-types";
import { classifyClinicalRequest, classifyGeneratedText, type ProhibitedClinicalBehavior } from "./response-classifier";
import { allowedResponsePartSchema, type AllowedResponseContract, type ClinicalResponseMode } from "./response-contract";

export type PolicyViolation = Readonly<{ code: string; behavior: ProhibitedClinicalBehavior | null }>;
export type ClinicalPolicyResult = Readonly<{
  mode: ClinicalResponseMode;
  violation: PolicyViolation | null;
  terminal: boolean;
  text?: string;
}>;

const abstention: Record<SafetyLocale, string> = {
  "es-CO": "No puedo confirmar diagnósticos ni indicar tratamientos. Consulte con un pediatra.",
  "en-US": "I cannot confirm diagnoses or recommend treatments. Consult a pediatrician.",
};

export class ClinicalResponsePolicy {
  evaluateRequest(input: Readonly<{ text: string; locale: SafetyLocale; safetyDecision: SafetyDecision }>): ClinicalPolicyResult {
    if (input.safetyDecision.decision === "urgent") return deepFreeze({ mode: "approved_terminal", violation: null, terminal: true });
    if (input.safetyDecision.decision === "professional_review") return deepFreeze({ mode: "approved_terminal", violation: null, terminal: true });
    if (input.safetyDecision.decision === "indeterminate" || input.safetyDecision.decision === "clarification_required") return deepFreeze({ mode: "abstain", violation: null, terminal: true, text: abstention[input.locale] });
    const classification = classifyClinicalRequest(input.text);
    return classification.allowed
      ? deepFreeze({ mode: "educational", violation: null, terminal: false })
      : deepFreeze({ mode: "abstain", terminal: true, text: abstention[input.locale], violation: { code: classification.code, behavior: classification.behavior } });
  }

  validateGeneratedResponse(response: unknown, locale: SafetyLocale): Readonly<{ ok: true; part: AllowedResponseContract } | { ok: false; violation: PolicyViolation; fallback: string }> {
    const parsed = allowedResponsePartSchema.safeParse(response);
    if (!parsed.success) return { ok: false, violation: { code: "INVALID_RESPONSE_CONTRACT", behavior: null }, fallback: abstention[locale] };
    if (parsed.data.kind === "educational" || parsed.data.kind === "deterministic_result") {
      const classification = classifyGeneratedText(parsed.data.text);
      if (!classification.allowed) return { ok: false, violation: { code: classification.code, behavior: classification.behavior }, fallback: abstention[locale] };
    }
    return { ok: true, part: parsed.data };
  }
}

export function createClinicalResponsePolicy(): ClinicalResponsePolicy { return new ClinicalResponsePolicy(); }
