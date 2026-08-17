import type { MeasurementType } from "./types.ts";

export type CaptureWarning = "method_review" | "date_old" | "transition_method_required";
export type CaptureRejection = "invalid_structure" | "future_date" | "local_date_mismatch" | "outside_capture_limit" | "unsupported_method" | "hard_physical_limit";

export type MeasurementCapturePolicy = Readonly<{
  policyId: string;
  version: string;
  futureSkewSeconds: number;
  maxAgeDays: number;
  hardLimits?: Readonly<Partial<Record<MeasurementType, Readonly<{ min: string; max: string }>>>>;
}>;

export const DEFAULT_CAPTURE_POLICY: MeasurementCapturePolicy = Object.freeze({
  policyId: "anthropometry-capture",
  version: "1.0.0",
  futureSkewSeconds: 0,
  maxAgeDays: 3650,
  hardLimits: Object.freeze({
    weight: Object.freeze({ min: "0.1", max: "300" }),
    recumbent_length: Object.freeze({ min: "20", max: "150" }),
    standing_height: Object.freeze({ min: "20", max: "250" }),
    head_circumference: Object.freeze({ min: "15", max: "80" }),
  }),
});
