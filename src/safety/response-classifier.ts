export type ProhibitedClinicalBehavior = "diagnosis" | "prescription" | "medicine_selection" | "dose_authorization" | "treatment_plan" | "false_reassurance" | "professional_operation" | "urgent_decoration";

export type RequestClassification = Readonly<{
  allowed: boolean;
  behavior: ProhibitedClinicalBehavior | null;
  code: string;
}>;

const patterns: readonly Readonly<{ behavior: ProhibitedClinicalBehavior; code: string; pattern: RegExp }>[] = [
  { behavior: "diagnosis", code: "DIAGNOSIS_REQUEST", pattern: /(?:diagn[oó]stic|qu[eé]\s+diagn[oó]stico\s+tiene|confirmar?\s+(?:el\s+)?diagn[oó]stico|descartar?\s+(?:el\s+)?diagn[oó]stico|rule\s+out\s+(?:the\s+)?diagnosis)/iu },
  { behavior: "prescription", code: "PRESCRIPTION_REQUEST", pattern: /(?:prescrib|recet|qu[eé]\s+le\s+doy\b|should\s+i\s+give|what\s+should\s+.*\s+take)/iu },
  { behavior: "medicine_selection", code: "MEDICINE_SELECTION", pattern: /(?:ibuprofen|acetaminophen|paracetamol|choose\s+.*\s+drug|qu[eé]\s+medicamento)/iu },
  { behavior: "dose_authorization", code: "DOSE_AUTHORIZATION", pattern: /(?:safe\s+to\s+give|seguro\s+darle|is\s+this\s+dose|esta\s+dosis|cu[aá]nto\s+.*(?:de\s+)?dosis|mg\s*\/|ml\s*\/)/iu },
  { behavior: "treatment_plan", code: "TREATMENT_PLAN", pattern: /(?:tratamiento\s+para\s+curar|remedio\s+casero\s+para\s+curar|home\s+care|qu[eé]\s+hago\s+para\s+curar)/iu },
  { behavior: "false_reassurance", code: "FALSE_REASSURANCE", pattern: /(?:definitely\s+safe|nothing\s+to\s+worry|no\s+es\s+nada\b|est[aá]\s+bien\s+seguro|not\s+serious|don'?t\s+worry)/iu },
  { behavior: "professional_operation", code: "PROFESSIONAL_OPERATION", pattern: /(?:book\s+(?:an?\s+)?appointment|schedule\s+(?:an?\s+)?appointment|call\s+(?:the\s+)?(?:doctor|pediatrician|clinic|hospital)|message\s+the\s+doctor|agend(?:ar?|a)\s+(?:una\s+)?cita\s+m[eé]dica|pedir\s+(?:una\s+)?cita\s+m[eé]dica|llamar?\s+al\s+(?:m[eé]dico|pediatra|doctor)|contactar?\s+al\s+(?:m[eé]dico|pediatra))/iu },
  { behavior: "urgent_decoration", code: "URGENT_DECORATION", pattern: /(?:ambulance|911|emergency\s+number|urgencias.*bot[oó]n)/iu },
];

export function classifyClinicalRequest(text: string): RequestClassification {
  if (typeof text !== "string" || text.length > 8_000) return Object.freeze({ allowed: false, behavior: null, code: "INVALID_RESPONSE_INPUT" });
  const match = patterns.find((candidate) => candidate.pattern.test(text));
  return match ? Object.freeze({ allowed: false, behavior: match.behavior, code: match.code }) : Object.freeze({ allowed: true, behavior: null, code: "ALLOWED_BASIC_GUIDANCE" });
}

export function classifyGeneratedText(text: string): RequestClassification {
  const classification = classifyClinicalRequest(text);
  if (!classification.allowed) return classification;
  if (/(?:you have|tienes|es|is|(?:your|tu|the|el|la)\s+(?:child|baby|hijo|hija|niño|niña)\s+(?:has|tiene|is|es))\s*(?:pneumonia|bronchiolitis|asthma|neumon[ií]a|bronquiolitis|asma)/iu.test(text)) return Object.freeze({ allowed: false, behavior: "diagnosis", code: "DIAGNOSIS_ASSERTION" });
  return classification;
}
