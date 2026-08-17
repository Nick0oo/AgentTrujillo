export type RedFlagCorpusCase = Readonly<{
  id: string;
  locale: "es-CO" | "en-US";
  country: "CO" | "US";
  input: string;
  expected: "urgent" | "not_urgent" | "indeterminate";
  copyKey: "emergency_department_es_co_v1" | "emergency_department_en_us_v1";
  tags: readonly ("clear_positive" | "clear_negative" | "negation" | "quotation" | "other_subject" | "ambiguous" | "locale_boundary")[];
  reviewerEvidenceId: "synthetic-review-required-v1";
  mutationFamily: string;
}>;

export const RED_FLAG_CORPUS: readonly RedFlagCorpusCase[] = Object.freeze([
  { id: "rf-co-positive-breathing-001", locale: "es-CO", country: "CO", input: "Mi hijo no puede respirar", expected: "urgent", copyKey: "emergency_department_es_co_v1", tags: ["clear_positive"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "positive-vs-negated-ability" },
  { id: "rf-co-negative-breathing-001", locale: "es-CO", country: "CO", input: "Mi hijo puede respirar ahora", expected: "not_urgent", copyKey: "emergency_department_es_co_v1", tags: ["clear_negative"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "positive-vs-negated-ability" },
  { id: "rf-co-negated-001", locale: "es-CO", country: "CO", input: "Mi hijo no tiene dificultad para respirar", expected: "not_urgent", copyKey: "emergency_department_es_co_v1", tags: ["negation"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "negation" },
  { id: "rf-co-quoted-001", locale: "es-CO", country: "CO", input: '"Mi hijo no puede respirar" dice el texto', expected: "indeterminate", copyKey: "emergency_department_es_co_v1", tags: ["quotation", "ambiguous"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "quotation" },
  { id: "rf-co-other-subject-001", locale: "es-CO", country: "CO", input: "Mi hermano no puede respirar", expected: "indeterminate", copyKey: "emergency_department_es_co_v1", tags: ["other_subject", "ambiguous"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "subject" },
  { id: "rf-us-positive-breathing-001", locale: "en-US", country: "US", input: "My child cannot breathe", expected: "urgent", copyKey: "emergency_department_en_us_v1", tags: ["clear_positive", "locale_boundary"], reviewerEvidenceId: "synthetic-review-required-v1", mutationFamily: "locale" },
]);
