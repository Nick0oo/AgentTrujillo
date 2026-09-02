import { z } from "zod";

const SHA256 = z.string().regex(/^[a-f0-9]{64}$/u);
const INDICATOR = z.enum([
  "weight_for_age",
  "length_for_age",
  "height_for_age",
  "weight_for_length",
  "weight_for_height",
  "head_circumference_for_age",
  "bmi_for_age",
]);

const COPY = z.object({
  summaryTitle: z.string().min(1).max(80),
  withinExpected: z.string().min(1).max(240),
  reviewRequired: z.string().min(1).max(240),
  unavailable: z.string().min(1).max(240),
  disclaimer: z.string().min(1).max(240),
}).strict();

const ALGORITHM_FILE = z.object({
  path: z.enum([
    "src/clinical/anthropometry/chronological-age.ts",
    "src/clinical/anthropometry/standard-selector.ts",
    "src/clinical/anthropometry/z-score.ts",
    "src/clinical/anthropometry/percentile.ts",
    "src/clinical/anthropometry/growth-assessment.ts",
  ]),
  sha256: SHA256,
}).strict();

const BASE = {
  allowedIndicators: z.array(INDICATOR).min(1).max(7),
  prematurityPolicy: z.literal("rule_unavailable"),
  copy: COPY,
  algorithmFiles: z.array(ALGORITHM_FILE).length(5),
  fixtureDigest: SHA256,
} as const;

const CO_PACKAGE = z.object({
  packageKey: z.literal("growth-co-who-v1"),
  countryCode: z.literal("CO"),
  locale: z.literal("es-CO"),
  transitionPolicy: z.literal("who_0_to_60_months"),
  datasetDigests: z.object({ WHO_2006: SHA256 }).strict(),
  ...BASE,
}).strict();

const US_PACKAGE = z.object({
  packageKey: z.literal("growth-us-who-cdc-v1"),
  countryCode: z.literal("US"),
  locale: z.literal("en-US"),
  transitionPolicy: z.literal("who_before_24_completed_months_cdc_from_24"),
  datasetDigests: z.object({
    WHO_2006: SHA256,
    CDC_2000: SHA256,
    CDC_2022_EXTENDED_BMI: SHA256,
  }).strict(),
  ...BASE,
}).strict();

export const GROWTH_PACKAGE_PAYLOAD_SCHEMA = z.discriminatedUnion("countryCode", [CO_PACKAGE, US_PACKAGE]);

export type GrowthPackagePayload = Readonly<z.infer<typeof GROWTH_PACKAGE_PAYLOAD_SCHEMA>>;
export type GrowthPackageCountry = GrowthPackagePayload["countryCode"];
export type GrowthDatasetKey = "WHO_2006" | "CDC_2000" | "CDC_2022_EXTENDED_BMI";
