import type { MedicationValidationOutcome } from "./types.ts";

export function mapMedicationValidationStatus(input: Readonly<{ within: boolean; outside: boolean; insufficient: boolean; professionalReview: boolean }>): MedicationValidationOutcome {
  if (input.professionalReview) return "requires_professional_review";
  if (input.insufficient) return "insufficient_data";
  if (input.outside) return "outside_reference_limits";
  if (input.within) return "within_reference_limits";
  return "insufficient_data";
}

export type DoseValidationStatus = MedicationValidationOutcome;
export type DoseValidationReasonCode = string;
export type DoseValidationDecisionInput = Readonly<{ within: boolean; outside: boolean; insufficient: boolean; professionalReview: boolean }>;
export type DoseValidationDecision = Readonly<{ status: MedicationValidationOutcome }>;
export const mapDoseValidationStatus = (input: DoseValidationDecisionInput): DoseValidationDecision => ({ status: mapMedicationValidationStatus(input) });
