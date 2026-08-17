import { z } from "zod";

export const medicationCountrySchema = z.enum(["CO", "US"]);
export type MedicationCountry = z.infer<typeof medicationCountrySchema>;

export const medicationCodingSystemSchema = z.enum(["INVIMA", "IUM", "RxNorm"]);
export type MedicationCodingSystem = z.infer<typeof medicationCodingSystemSchema>;

export const medicationRouteSchema = z.enum(["oral", "intravenous", "intramuscular", "subcutaneous", "topical", "inhaled", "other"]);
export type MedicationRoute = z.infer<typeof medicationRouteSchema>;

export const medicationFormSchema = z.enum(["tablet", "capsule", "solution", "suspension", "drop", "inhaler", "cream", "other"]);
export type MedicationForm = z.infer<typeof medicationFormSchema>;

export const medicationUnitSchema = z.enum(["mg", "mcg", "g", "mL", "L", "tablet", "capsule", "drop", "puff", "application"]);
export type MedicationUnit = z.infer<typeof medicationUnitSchema>;

export const medicationValidationOutcomeSchema = z.enum([
  "within_reference_limits",
  "outside_reference_limits",
  "insufficient_data",
  "requires_professional_review",
]);
export type MedicationValidationOutcome = z.infer<typeof medicationValidationOutcomeSchema>;

export type ExactDecimalString = string & { readonly __exactMedicationDecimal: unique symbol };
export type MedicationConceptId = string & { readonly __medicationConceptId: unique symbol };
export type MedicationPresentationId = string & { readonly __medicationPresentationId: unique symbol };

export type MedicationIngredient = Readonly<{
  ingredientCode: string;
  codingSystem: MedicationCodingSystem;
  name: string;
  salt?: string;
  amount?: ExactDecimalString;
  amountUnit?: MedicationUnit;
}>;

export type MedicationConcept = Readonly<{
  id: MedicationConceptId;
  country: MedicationCountry;
  codingSystem: MedicationCodingSystem;
  conceptCode: string;
  normalizedName: string;
  displayName: string;
  ingredients: readonly MedicationIngredient[];
}>;

export type MedicationConcentration = Readonly<{
  numerator: ExactDecimalString;
  numeratorUnit: MedicationUnit;
  denominator: ExactDecimalString;
  denominatorUnit: MedicationUnit;
}>;

export type MedicationPresentation = Readonly<{
  id: MedicationPresentationId;
  conceptId: MedicationConceptId;
  country: MedicationCountry;
  form: MedicationForm;
  route: MedicationRoute;
  concentration: MedicationConcentration | null;
  release: "immediate" | "extended" | "delayed" | "unknown";
  regulatoryIdentifier: string;
  ingredients: readonly MedicationIngredient[];
}>;

export type MedicationSourceEvidence = Readonly<{
  sourceId: string;
  sourceVersion: string;
  sourceKind: "identity" | "label" | "formulary" | "algorithm";
  sourceUri: string;
  artifactSha256: string;
}>;

export type ApprovedMedicationPackage = Readonly<{
  packageId: string;
  country: MedicationCountry;
  version: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  algorithmVersion: string;
  vocabularyVersion: string;
  status: "approved" | "active";
  approvedBy: string;
  artifactSha256: string;
  sources: readonly MedicationSourceEvidence[];
}>;

export type MedicationDoseRule = Readonly<{
  ruleId: string;
  packageId: string;
  conceptCode: string;
  route: MedicationRoute;
  indicationCode: string | null;
  minAgeDays: number | null;
  maxAgeDays: number | null;
  minWeightKg: ExactDecimalString | null;
  maxWeightKg: ExactDecimalString | null;
  perDoseMin: ExactDecimalString | null;
  perDoseMax: ExactDecimalString | null;
  perDoseUnit: MedicationUnit | null;
  perKgMin: ExactDecimalString | null;
  perKgMax: ExactDecimalString | null;
  absoluteSingleMax: ExactDecimalString | null;
  dailyMax: ExactDecimalString | null;
  dailyUnit: MedicationUnit | null;
  minimumIntervalHours: ExactDecimalString | null;
  exclusions: readonly string[];
}>;

export type MedicationWeightEvidence = Readonly<{
  measurementId: string;
  childId: string;
  valueKg: ExactDecimalString;
  measuredAt: string;
  confirmedAt: string;
  validationStatus: "confirmed";
  provenance: "professional" | "guardian" | "import" | "document";
}>;

export type MedicationFrequency =
  | Readonly<{ kind: "interval"; everyHours: string }>
  | Readonly<{ kind: "times_of_day"; times: readonly string[] }>
  | Readonly<{ kind: "as_needed"; label: string }>;

export type MedicationDeclaredDose = Readonly<{
  quantity: ExactDecimalString;
  unit: MedicationUnit;
  frequency: MedicationFrequency;
  route: MedicationRoute;
  declaredAt: string;
}>;

export type MedicationPlanInput = Readonly<{
  displayName: string;
  conceptCode: string;
  codingSystem: MedicationCodingSystem;
  presentationId?: string;
  declaredIndication?: string;
  startsAt: string;
  endsAt?: string;
  dose?: Readonly<{ quantity: string; unit: MedicationUnit }>;
  route?: MedicationRoute;
  frequency?: MedicationFrequency;
  instructions?: string;
}>;

export const medicationFrequencySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("interval"), everyHours: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/) }).strict(),
  z.object({ kind: z.literal("times_of_day"), times: z.array(z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)).min(1).max(24) }).strict(),
  z.object({ kind: z.literal("as_needed"), label: z.string().min(1).max(200) }).strict(),
]);

export const medicationPlanInputSchema = z.object({
  displayName: z.string().min(1).max(200),
  conceptCode: z.string().min(1).max(120),
  codingSystem: medicationCodingSystemSchema,
  presentationId: z.string().uuid().optional(),
  declaredIndication: z.string().min(1).max(200).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional(),
  dose: z.object({ quantity: z.string(), unit: medicationUnitSchema }).strict().optional(),
  route: medicationRouteSchema.optional(),
  frequency: medicationFrequencySchema.optional(),
  instructions: z.string().max(500).optional(),
}).strict();

export const medicationValidationResultSchema = z.object({
  outcome: medicationValidationOutcomeSchema,
  explanationCodes: z.array(z.string().min(1)).min(1),
  traceId: z.string().min(1),
  provenance: z.object({
    country: medicationCountrySchema,
    packageVersion: z.string().min(1),
    algorithmVersion: z.string().min(1),
    artifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();

export type MedicationValidationResult = z.infer<typeof medicationValidationResultSchema>;

export type MedicationValidationTrace = Readonly<{
  traceId: string;
  declaredInput: Readonly<Record<string, unknown>>;
  concept: MedicationConcept | null;
  presentation: MedicationPresentation | null;
  package: ApprovedMedicationPackage | null;
  rule: MedicationDoseRule | null;
  weight: MedicationWeightEvidence | null;
  arithmetic: readonly Readonly<Record<string, string>>[];
  explanationCodes: readonly string[];
}>;

export const medicationPlanRecordSchema = z.object({
  id: z.string().uuid(),
  careSpaceId: z.string().uuid(),
  childId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled", "superseded"]),
  input: medicationPlanInputSchema,
  recordedBy: z.string().uuid(),
  supersedesId: z.string().uuid().nullable(),
}).strict();

export type MedicationPlanRecord = Readonly<{
  id: string;
  careSpaceId: string;
  childId: string;
  version: number;
  status: "draft" | "active" | "paused" | "completed" | "cancelled" | "superseded";
  input: MedicationPlanInput;
  recordedBy: string;
  supersedesId: string | null;
}>;

export type MedicationScheduleOccurrence = Readonly<{
  occurrenceId: string;
  planId: string;
  planVersion: number;
  scheduledFor: string;
  localDate: string;
  timeZone: string;
  source: "interval" | "times_of_day";
}>;

export type MedicationIntakeState = "taken" | "skipped" | "unknown";

export type MedicationIntakeRecord = Readonly<{
  id: string;
  planId: string;
  occurrenceId: string | null;
  scheduledFor: string | null;
  takenAt: string | null;
  state: MedicationIntakeState;
  quantity: ExactDecimalString | null;
  unit: MedicationUnit | null;
  recordedBy: string;
  supersedesId: string | null;
}>;

export type AdherenceSummary = Readonly<{
  windowStart: string;
  windowEnd: string;
  timeZone: string;
  counts: Readonly<{ scheduled: number; taken: number; skipped: number; unknown: number; noReport: number }>;
  sourceComplete: boolean;
}>;

// Roadmap vocabulary aliases keep the public contract stable while the
// internal implementation names remain explicit about what is being resolved.
export type DeclaredMedicationRegimen = MedicationPlanInput;
export type PediatricDoseLimitRule = MedicationDoseRule;
export type VerifiedWeightEvidence = MedicationWeightEvidence;
export type DoseConversionTrace = MedicationValidationTrace;
export type DoseValidationResult = MedicationValidationResult;
export type MedicationPlan = MedicationPlanRecord;
export type MedicationSchedule = MedicationScheduleOccurrence;
export type MedicationIntake = MedicationIntakeRecord;
