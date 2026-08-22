import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import {
  medicationCodingSystemSchema,
  medicationCountrySchema,
  medicationFormSchema,
  medicationRouteSchema,
  medicationUnitSchema,
  type ApprovedMedicationPackage,
  type MedicationConcept,
  type MedicationDoseRule,
  type MedicationPresentation,
} from "./types.ts";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const decimalSchema = z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
const ingredientSchema = z.object({
  ingredientCode: z.string().min(1), codingSystem: medicationCodingSystemSchema, name: z.string().min(1),
}).strict();
const sourceSchema = z.object({
  sourceId: z.string().min(1), sourceVersion: z.string().min(1),
  sourceKind: z.enum(["identity", "label", "formulary", "algorithm"]),
  sourceUri: z.string().url(), artifactSha256: sha256Schema,
}).strict();
const conceptSchema = z.object({
  id: z.string().uuid(), country: medicationCountrySchema, codingSystem: medicationCodingSystemSchema,
  conceptCode: z.string().min(1), normalizedName: z.string().min(1), displayName: z.string().min(1),
  ingredients: z.array(ingredientSchema).min(1),
}).strict();
const concentrationSchema = z.object({
  numerator: decimalSchema, numeratorUnit: medicationUnitSchema,
  denominator: decimalSchema, denominatorUnit: medicationUnitSchema,
}).strict();
const presentationSchema = z.object({
  id: z.string().uuid(), conceptId: z.string().uuid(), country: medicationCountrySchema,
  form: medicationFormSchema, route: medicationRouteSchema, concentration: concentrationSchema,
  release: z.enum(["immediate", "extended", "delayed", "unknown"]),
  regulatoryIdentifier: z.string().min(1), ingredients: z.array(ingredientSchema).min(1),
}).strict();
const ruleSchema = z.object({
  ruleId: z.string().min(1), packageId: z.string().uuid(), conceptCode: z.string().min(1),
  route: medicationRouteSchema, indicationCode: z.string().nullable(),
  minAgeDays: z.number().int().nonnegative().nullable(), maxAgeDays: z.number().int().nonnegative().nullable(),
  minWeightKg: decimalSchema.nullable(), maxWeightKg: decimalSchema.nullable(),
  perDoseMin: decimalSchema.nullable(), perDoseMax: decimalSchema.nullable(), perDoseUnit: medicationUnitSchema.nullable(),
  perKgMin: decimalSchema.nullable(), perKgMax: decimalSchema.nullable(), absoluteSingleMax: decimalSchema.nullable(),
  dailyMax: decimalSchema.nullable(), dailyUnit: medicationUnitSchema.nullable(), minimumIntervalHours: decimalSchema.nullable(),
  exclusions: z.array(z.string().min(1)).min(1),
}).strict();
const artifactSchema = z.object({
  schemaVersion: z.literal("medication-basic-formulary-v1"), packageId: z.string().uuid(), country: medicationCountrySchema,
  version: z.string().min(1), effectiveFrom: z.string().datetime({ offset: true }), effectiveUntil: z.string().datetime({ offset: true }).nullable(),
  algorithmVersion: z.literal("medication-declared-dose-basic-1.0.0"), vocabularyVersion: z.literal("acetaminophen-160mg-5ml-v1"),
  identity: z.record(z.string(), z.string().min(1)), sources: z.array(sourceSchema).min(1), concept: conceptSchema,
  presentation: presentationSchema, rules: z.array(ruleSchema).min(1),
}).strict().superRefine((value, context) => {
  if (value.concept.country !== value.country || value.presentation.country !== value.country
    || value.presentation.conceptId !== value.concept.id) context.addIssue({ code: "custom", message: "country_or_concept_mismatch" });
  if (value.rules.some((rule) => rule.packageId !== value.packageId || rule.conceptCode !== value.concept.conceptCode)) {
    context.addIssue({ code: "custom", message: "rule_identity_mismatch" });
  }
  if (new Set(value.rules.map((rule) => rule.ruleId)).size !== value.rules.length) context.addIssue({ code: "custom", message: "duplicate_rule" });
});

export type BasicMedicationArtifact = Readonly<{
  schemaVersion: "medication-basic-formulary-v1";
  identity: Readonly<Record<string, string>>;
  package: ApprovedMedicationPackage;
  concept: MedicationConcept;
  presentation: MedicationPresentation;
  rules: readonly MedicationDoseRule[];
}>;

const paths = {
  CO: new URL("./data/co-dolex-children-basic-2026.json", import.meta.url),
  US: new URL("./data/us-childrens-tylenol-basic-2024.json", import.meta.url),
} as const;

export function loadBasicMedicationArtifact(country: "CO" | "US"): BasicMedicationArtifact {
  const bytes = readFileSync(fileURLToPath(paths[country]));
  const value = artifactSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (value.country !== country) throw new Error("MEDICATION_ARTIFACT_COUNTRY_MISMATCH");
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    identity: Object.freeze({ ...value.identity }),
    package: Object.freeze({
      packageId: value.packageId, country: value.country, version: value.version,
      effectiveFrom: value.effectiveFrom, effectiveUntil: value.effectiveUntil,
      algorithmVersion: value.algorithmVersion, vocabularyVersion: value.vocabularyVersion,
      status: "active", approvedBy: "product_owner_conveyed", artifactSha256,
      sources: value.sources,
    }) as ApprovedMedicationPackage,
    concept: Object.freeze({
      ...value.concept,
      id: value.concept.id as MedicationConcept["id"],
    }),
    presentation: Object.freeze({
      ...value.presentation,
      id: value.presentation.id as MedicationPresentation["id"],
      conceptId: value.presentation.conceptId as MedicationPresentation["conceptId"],
      concentration: value.presentation.concentration as MedicationPresentation["concentration"],
    }),
    rules: value.rules as readonly MedicationDoseRule[],
  });
}
