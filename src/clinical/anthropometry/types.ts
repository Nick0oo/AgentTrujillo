import type { Sha256Hex } from "../governance/source-types.ts";

export type MeasurementType =
  | "weight"
  | "recumbent_length"
  | "standing_height"
  | "head_circumference";

export type AnthropometricUnit = "kg" | "g" | "lb" | "oz" | "lb_oz" | "cm" | "mm" | "in";
export type MeasurementMethod =
  | "digital_scale"
  | "mechanical_scale"
  | "length_board"
  | "stadiometer"
  | "tape_measure"
  | "unknown";
export type MeasurementProvenance = "guardian" | "professional" | "import" | "document" | "chat";
export type MeasurementValidationStatus = "confirmed" | "excluded";
export type GrowthSex = "female" | "male";
export type GrowthIndicator =
  | "weight_for_age"
  | "length_for_age"
  | "height_for_age"
  | "weight_for_length"
  | "weight_for_height"
  | "head_circumference_for_age"
  | "bmi_for_age";

export type GrowthAssessmentStatus = "calculated" | "rule_unavailable" | "insufficient_data" | "excluded";
export type GrowthInterpretation = "within_expected" | "review_required" | "urgent_review" | "unavailable";
export type GrowthAgeBasis = "chronological" | "corrected";
export type GrowthWarning =
  | "age_unavailable"
  | "corrected_age_unavailable"
  | "standard_unavailable"
  | "dataset_unavailable"
  | "numerical_instability"
  | "insufficient_companion"
  | "measurement_excluded"
  | "transition_boundary"
  | "precision_limited"
  | "review_required";

export type ExactClinicalDecimal = Readonly<{
  lexeme: string;
  canonical: string;
  scaledInteger: string;
  scale: number;
  sign: -1 | 0 | 1;
}>;

export type MeasurementId = string & { readonly __measurementId: unique symbol };
export type AssessmentId = string & { readonly __assessmentId: unique symbol };
export type ScopeFingerprint = string & { readonly __scopeFingerprint: unique symbol };

export type MeasurementCommand = Readonly<{
  measurementType: MeasurementType;
  value: string;
  unit: AnthropometricUnit;
  occurredAt: string;
  localDate: string;
  timeZone: string;
  measurementMethod?: MeasurementMethod;
  device?: string;
  provenanceType?: MeasurementProvenance;
}>;

export type NormalizedMeasurementValue = Readonly<{
  original: ExactClinicalDecimal;
  originalUnit: AnthropometricUnit;
  normalized: ExactClinicalDecimal;
  normalizedUnit: "kg" | "cm";
  conversionVersion: string;
  roundingMode: "none" | "half_even";
}>;

export type ConfirmedMeasurement = Readonly<{
  id: MeasurementId;
  scopeFingerprint: ScopeFingerprint;
  careSpaceId: string;
  childId: string;
  measurementType: MeasurementType;
  value: NormalizedMeasurementValue;
  occurredAt: string;
  localDate: string;
  timeZone: string;
  measurementMethod: MeasurementMethod;
  provenanceType: MeasurementProvenance;
  recordedBy: string;
  validationStatus: MeasurementValidationStatus;
  inputFingerprint: string;
}>;

export type GrowthAgeContext = Readonly<{
  chronologicalAgeDays: number;
  correctedAgeDays: number | null;
  basis: GrowthAgeBasis;
  referenceInstant: string;
  timeZone: string;
  algorithmVersion: string;
}>;

export type GrowthStandardIdentity = Readonly<{
  key: string;
  datasetKey: string;
  version: string;
  sourceDigest: Sha256Hex;
}>;

export type ClinicalResultProvenance = Readonly<{
  measurementId: string;
  rulePackId: string;
  algorithmId: string;
  datasetDigest: Sha256Hex;
  inputDigest: Sha256Hex;
  decisionDigest: Sha256Hex;
}>;

type GrowthAssessmentCommon = Readonly<{
  standard: GrowthStandardIdentity | null;
  indicator: GrowthIndicator;
  age: GrowthAgeContext;
  warnings: readonly GrowthWarning[];
  interpretation: GrowthInterpretation;
  provenance: ClinicalResultProvenance;
}>;

export type GrowthAssessmentResult =
  | (GrowthAssessmentCommon & {
      status: "calculated";
      zScore: ExactClinicalDecimal;
      percentile: ExactClinicalDecimal;
    })
  | (GrowthAssessmentCommon & {
      status: Exclude<GrowthAssessmentStatus, "calculated">;
      zScore: null;
      percentile: null;
    });

export type GrowthSeriesPoint = Readonly<{
  measurementId: string;
  assessmentId: string;
  occurredAt: string;
  indicator: GrowthIndicator;
  standard: GrowthStandardIdentity;
  ageBasis: GrowthAgeBasis;
  measurementMethod: MeasurementMethod;
  status: GrowthAssessmentStatus;
  zScore: ExactClinicalDecimal | null;
  percentile: ExactClinicalDecimal | null;
  transitionReason: string | null;
}>;
