import { z } from "zod";

import type { GrowthWarning } from "./types.ts";

const uuid = z.string().uuid();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const isoInstant = z.string().datetime({ offset: true });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimalLexeme = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/).refine((value) => BigInt(value.replace(".", "")) > 0n, "positive");
const timeZone = z.string().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, "iana timezone");

const measurementCommandSchemaBase = z.object({
  measurementType: z.enum(["weight", "recumbent_length", "standing_height", "head_circumference"]),
  value: decimalLexeme,
  unit: z.enum(["kg", "g", "lb", "oz", "lb_oz", "cm", "mm", "in"]),
  occurredAt: isoInstant,
  localDate,
  timeZone,
  measurementMethod: z.enum(["digital_scale", "mechanical_scale", "length_board", "stadiometer", "tape_measure", "unknown"]).optional(),
  device: z.string().trim().min(1).max(200).optional(),
  provenanceType: z.enum(["guardian", "professional", "import", "document", "chat"]).optional(),
}).strict();

export const measurementCommandSchema = measurementCommandSchemaBase.superRefine((value, context) => {
  const occurred = new Date(value.occurredAt);
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: value.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(occurred);
  if (local !== value.localDate) context.addIssue({ code: "custom", path: ["localDate"], message: "local date mismatch" });
});

const exactDecimal = z.object({
  lexeme: z.string().min(1),
  canonical: z.string().min(1),
  scaledInteger: z.string().regex(/^-?\d+$/),
  scale: z.number().int().nonnegative(),
  sign: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
}).strict();

const standard = z.object({
  key: z.string().min(1),
  datasetKey: z.string().min(1),
  version: z.string().min(1),
  sourceDigest: digest,
}).strict();

const age = z.object({
  chronologicalAgeDays: z.number().int().nonnegative(),
  correctedAgeDays: z.number().int().nonnegative().nullable(),
  basis: z.enum(["chronological", "corrected"]),
  referenceInstant: isoInstant,
  timeZone,
  algorithmVersion: z.string().min(1),
}).strict();

const provenance = z.object({
  measurementId: uuid,
  rulePackId: z.string().min(1),
  algorithmId: z.string().min(1),
  datasetDigest: digest,
  inputDigest: digest,
  decisionDigest: digest,
}).strict();

const warnings = z.array(z.enum([
  "age_unavailable",
  "corrected_age_unavailable",
  "standard_unavailable",
  "dataset_unavailable",
  "numerical_instability",
  "insufficient_companion",
  "measurement_excluded",
  "transition_boundary",
  "precision_limited",
  "review_required",
] satisfies readonly [GrowthWarning, ...GrowthWarning[]])).readonly();

const assessmentCommon = {
  standard,
  indicator: z.enum(["weight_for_age", "length_for_age", "height_for_age", "weight_for_length", "weight_for_height", "head_circumference_for_age", "bmi_for_age"]),
  age,
  warnings,
  provenance,
} as const;

export const growthAssessmentResultSchema = z.discriminatedUnion("status", [
  z.object({ ...assessmentCommon, status: z.literal("calculated"), zScore: exactDecimal, percentile: exactDecimal }).strict(),
  z.object({ ...assessmentCommon, status: z.literal("rule_unavailable"), zScore: z.null(), percentile: z.null() }).strict(),
  z.object({ ...assessmentCommon, status: z.literal("insufficient_data"), zScore: z.null(), percentile: z.null() }).strict(),
  z.object({ ...assessmentCommon, status: z.literal("excluded"), zScore: z.null(), percentile: z.null() }).strict(),
]);

export type MeasurementCommandInput = z.infer<typeof measurementCommandSchema>;
