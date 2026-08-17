export type ProhibitedClinicalBehavior = "diagnosis" | "prescription" | "medicine_selection" | "dose_authorization" | "treatment_plan" | "false_reassurance" | "professional_operation" | "urgent_decoration";

export type RequestClassification = Readonly<{
  allowed: boolean;
  behavior: ProhibitedClinicalBehavior | null;
  code: string;
}>;

const patterns: readonly Readonly<{ behavior: ProhibitedClinicalBehavior; code: string; pattern: RegExp }>[] = [
  { behavior: "diagnosis", code: "DIAGNOSIS_REQUEST", pattern: /(?:diagn[oó]stic|what does|what is|qué tiene|es una|confirma|descarta|rule out|condition|enfermedad)/iu },
  { behavior: "prescription", code: "PRESCRIPTION_REQUEST", pattern: /(?:prescrib|recet|indique|manda|should i give|qué le doy|what should .* take)/iu },
  { behavior: "medicine_selection", code: "MEDICINE_SELECTION", pattern: /(?:medicin|medication|antibiotic|ibuprofen|acetaminophen|paracetamol|choose .* drug|qué medicamento)/iu },
  { behavior: "dose_authorization", code: "DOSE_AUTHORIZATION", pattern: /(?:safe to give|seguro darle|is this dose|esta dosis|how much|cu[aá]nto .* dosis|mg\s*\/|ml\s*\/)/iu },
  { behavior: "treatment_plan", code: "TREATMENT_PLAN", pattern: /(?:treat|tratamiento|first aid|remedio|home care|qué hago para curar)/iu },
  { behavior: "false_reassurance", code: "FALSE_REASSURANCE", pattern: /(?:definitely safe|nothing to worry|no es nada|est[aá] bien seguro|not serious|don'?t worry)/iu },
  { behavior: "professional_operation", code: "PROFESSIONAL_OPERATION", pattern: /(?:book|appointment|schedule|call|phone|contact|message the doctor|cita|agenda|llama|tel[eé]fono|contacte|escr[ií]bale|m[aá]ndale)/iu },
  { behavior: "urgent_decoration", code: "URGENT_DECORATION", pattern: /(?:ambulance|911|emergency number|map|direcci[oó]n|urgencias.*bot[oó]n|notification|alerta)/iu },
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
