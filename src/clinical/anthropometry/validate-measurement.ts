import type { ChronologicalAge } from "./age-policy.ts";
import { measurementCommandSchema } from "./schemas.ts";
import type { MeasurementCapturePolicy, CaptureRejection, CaptureWarning } from "./capture-policy.ts";
import type { MeasurementCommand, NormalizedMeasurementValue, MeasurementMethod, MeasurementProvenance } from "./types.ts";
import { compareClinicalDecimal, parseClinicalDecimal } from "./decimal.ts";
import { deepFreeze } from "./value-objects.ts";

export type MeasurementCandidate = Readonly<{
  command: MeasurementCommand;
  normalizedValue: NormalizedMeasurementValue;
  age: ChronologicalAge;
  measurementType: MeasurementCommand["measurementType"];
  measurementMethod: MeasurementMethod;
  provenanceType: MeasurementProvenance;
  validationStatus: "valid" | "review_required" | "rejected" | "excluded";
  fingerprintMaterial: Readonly<Record<string, string>>;
}>;

export type CaptureValidationResult = Readonly<{
  status: "valid" | "review_required" | "rejected" | "excluded";
  warnings: readonly CaptureWarning[];
  rejection: CaptureRejection | null;
  candidate: MeasurementCandidate | null;
}>;

function frozenResult(result: CaptureValidationResult): CaptureValidationResult {
  return deepFreeze(result);
}

export function validateMeasurementCapture(
  rawCommand: MeasurementCommand,
  normalizedValue: NormalizedMeasurementValue,
  age: ChronologicalAge,
  policy: MeasurementCapturePolicy,
  now: Date,
): CaptureValidationResult {
  let command: MeasurementCommand;
  try {
    command = measurementCommandSchema.parse(rawCommand) as MeasurementCommand;
  } catch {
    return frozenResult({ status: "rejected", warnings: [], rejection: "invalid_structure", candidate: null });
  }
  const occurred = new Date(command.occurredAt);
  const nowMs = now.getTime();
  if (occurred.getTime() > nowMs + policy.futureSkewSeconds * 1000) return frozenResult({ status: "rejected", warnings: [], rejection: "future_date", candidate: null });
  const ageDays = Math.floor((nowMs - occurred.getTime()) / 86_400_000);
  if (ageDays > policy.maxAgeDays) return frozenResult({ status: "excluded", warnings: ["date_old"], rejection: "outside_capture_limit", candidate: null });
  const limits = policy.hardLimits?.[command.measurementType];
  if (limits) {
    const normalized = normalizedValue.normalized;
    if (compareClinicalDecimal(normalized, parseClinicalDecimal(limits.min)) <= 0 || compareClinicalDecimal(normalized, parseClinicalDecimal(limits.max)) >= 0) {
      return frozenResult({ status: "rejected", warnings: [], rejection: "hard_physical_limit", candidate: null });
    }
  }
  const method = command.measurementMethod ?? "unknown";
  const provenanceType = command.provenanceType ?? "guardian";
  const warnings: CaptureWarning[] = [];
  if (method === "unknown") warnings.push("method_review");
  if ((command.measurementType === "recumbent_length" && method !== "length_board")
    || (command.measurementType === "standing_height" && method !== "stadiometer")) warnings.push("transition_method_required");
  const status = warnings.length > 0 ? "review_required" : "valid";
  return frozenResult({
    status,
    warnings,
    rejection: null,
    candidate: {
      command,
      normalizedValue,
      age,
      measurementType: command.measurementType,
      measurementMethod: method,
      provenanceType,
      validationStatus: status,
      fingerprintMaterial: {
        measurementType: command.measurementType,
        normalizedValue: normalizedValue.normalized.canonical,
        normalizedUnit: normalizedValue.normalizedUnit,
        occurredAt: command.occurredAt,
        localDate: command.localDate,
        timeZone: command.timeZone,
        measurementMethod: method,
        provenanceType,
      },
    },
  });
}

export type { MeasurementCapturePolicy, CaptureRejection, CaptureWarning } from "./capture-policy.ts";
