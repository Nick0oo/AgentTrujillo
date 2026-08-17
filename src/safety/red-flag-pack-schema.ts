import { z } from "zod";

import { RED_FLAG_PACK_LIMITS } from "./red-flag-pack-types";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().regex(/^[a-z][a-z0-9_.-]{0,95}$/);
const copyKey = z.enum(["emergency_department_es_co_v1", "emergency_department_en_us_v1"]);
const assertion = z.enum(["present", "absent", "possible", "historical", "quoted", "instruction", "unknown"]);
const operator = z.enum(["eq", "gt", "gte", "lt", "lte"]);

const populationSchema = z.object({
  country: z.enum(["CO", "US"]),
  minAgeDays: z.number().int().min(0).max(18 * 366).optional(),
  maxAgeDays: z.number().int().min(0).max(18 * 366).optional(),
}).strict().superRefine((value, context) => {
  if (value.minAgeDays !== undefined && value.maxAgeDays !== undefined && value.minAgeDays > value.maxAgeDays) {
    context.addIssue({ code: "custom", path: ["maxAgeDays"], message: "invalid population range" });
  }
});

const predicateSchema: z.ZodTypeAny = z.lazy(() => z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("concept"), conceptId: id, assertion: z.array(assertion).min(1).max(7) }).strict(),
  z.object({ kind: z.literal("measurement"), measurement: z.literal("temperature"), operator, milliCelsius: z.number().int().min(-100_000).max(200_000) }).strict(),
  z.object({ kind: z.literal("age"), basis: z.enum(["chronological", "corrected"]), operator, days: z.number().int().min(0).max(18 * 366) }).strict(),
  z.object({ kind: z.literal("all"), predicates: z.array(predicateSchema).min(1).max(RED_FLAG_PACK_LIMITS.maxPredicatesPerRule) }).strict(),
  z.object({ kind: z.literal("any"), predicates: z.array(predicateSchema).min(1).max(RED_FLAG_PACK_LIMITS.maxPredicatesPerRule) }).strict(),
])) as z.ZodTypeAny;

const sourceSchema = z.object({ id, digestSha256: sha256 }).strict();

export const redFlagPackV1Schema = z.object({
  schemaVersion: z.literal("emergency-pack-v1"),
  packageId: id,
  jurisdiction: z.enum(["CO", "US"]),
  locale: z.enum(["es-CO", "en-US"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveUntil: z.string().datetime({ offset: true }).nullable(),
  algorithm: z.object({ key: id, version: z.string().regex(/^\d+\.\d+\.\d+$/), implementationSha256: sha256 }).strict(),
  sources: z.array(sourceSchema).min(1).max(256),
  copyKeys: z.array(copyKey).min(1).max(2),
  approval: z.object({ status: z.enum(["approved", "synthetic_test_only"]), artifactSha256: sha256, approvalId: id }).strict(),
  concepts: z.array(z.object({ id, patterns: z.array(z.string().min(1).max(128)).min(1).max(64) }).strict()).max(RED_FLAG_PACK_LIMITS.maxConceptPatterns),
  rules: z.array(z.object({
    code: id,
    priority: z.number().int().min(0).max(1_000_000),
    population: populationSchema,
    predicate: predicateSchema,
    ambiguityPolicy: z.enum(["clarify", "abstain", "urgent"]),
    decision: z.literal("urgent"),
    copyKey,
    sourceIds: z.array(id).min(1).max(256),
  }).strict()).max(RED_FLAG_PACK_LIMITS.maxRules),
}).strict().superRefine((pack, context) => {
  if (pack.jurisdiction === "CO" && pack.locale !== "es-CO") context.addIssue({ code: "custom", path: ["locale"], message: "CO requires es-CO" });
  if (pack.jurisdiction === "US" && pack.locale !== "en-US") context.addIssue({ code: "custom", path: ["locale"], message: "US requires en-US" });
  if (pack.effectiveUntil && pack.effectiveUntil <= pack.effectiveFrom) context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "invalid effective window" });
  const conceptIds = new Set<string>();
  let patterns = 0;
  for (const concept of pack.concepts) {
    if (conceptIds.has(concept.id)) context.addIssue({ code: "custom", path: ["concepts"], message: "duplicate concept" });
    conceptIds.add(concept.id);
    patterns += concept.patterns.length;
    for (const pattern of concept.patterns) {
      if (/https?:\/\/|www\.|[\\^$.*+?()[\]{}|]|\b\d{7,}\b/iu.test(pattern)) context.addIssue({ code: "custom", path: ["concepts"], message: "pattern must be a bounded literal" });
    }
  }
  if (patterns > RED_FLAG_PACK_LIMITS.maxConceptPatterns) context.addIssue({ code: "custom", path: ["concepts"], message: "too many concept patterns" });
  const sourceIds = new Set(pack.sources.map((source) => source.id));
  const copyKeys = new Set(pack.copyKeys);
  const ruleCodes = new Set<string>();
  for (const rule of pack.rules) {
    if (ruleCodes.has(rule.code)) context.addIssue({ code: "custom", path: ["rules"], message: "duplicate rule code" });
    ruleCodes.add(rule.code);
    if (!copyKeys.has(rule.copyKey)) context.addIssue({ code: "custom", path: ["rules"], message: "copy key not declared" });
    if (rule.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) context.addIssue({ code: "custom", path: ["rules"], message: "unknown rule source" });
    if (!pack.concepts.length && JSON.stringify(rule.predicate).includes('"concept"')) context.addIssue({ code: "custom", path: ["rules"], message: "unknown concept" });
  }
});

export type ParsedRedFlagPack = z.infer<typeof redFlagPackV1Schema>;
