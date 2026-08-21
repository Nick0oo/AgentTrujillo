import { z } from "zod";

import { isCalendarDate } from "../calendar.ts";

const calendarDateSchema = z.string().refine(isCalendarDate, "invalid calendar date");
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const intervalSchema = z.object({ unit: z.enum(["days", "calendar_months", "calendar_years"]), value: z.number().int().min(0).max(100_000) }).strict();
const ruleSchema = z.object({
  id: z.string().trim().min(1).max(200), code: z.string().trim().min(1).max(200), countryCode: z.literal("US"),
  kind: z.enum(["routine", "catch_up", "special_population", "campaign", "outbreak", "review_only"]),
  seriesCode: z.string().trim().min(1).max(200), doseCode: z.string().trim().min(1).max(200), doseNumber: z.number().int().min(1).max(100),
  antigenCode: z.string().trim().min(1).max(200), minimumAge: intervalSchema.nullable(), targetAge: intervalSchema.nullable(), targetAgeUntil: intervalSchema.nullable(),
  minimumInterval: intervalSchema.nullable(), recommendedInterval: intervalSchema.nullable(), gracePeriod: intervalSchema.nullable().optional(), catchUp: z.boolean(),
  eligibilityCriteria: z.record(z.string(), z.unknown()), contraindicationReviewRequired: z.boolean(), sourceReferenceIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100),
}).strict();
const dependencySchema = z.object({
  ruleId: z.string().trim().min(1).max(200), dependsOnRuleId: z.string().trim().min(1).max(200),
  dependencyType: z.enum(["previous_dose", "either_or", "conditional", "excludes"]), minimumInterval: intervalSchema.nullable(),
}).strict().refine((value) => value.ruleId !== value.dependsOnRuleId, "self dependency");

export type AcipRuleKind = "routine" | "catch_up" | "special_population" | "campaign" | "outbreak" | "review_only";
export type AcipOfficialStatus = "current" | "superseded" | "stayed" | "unknown";
export const acipUsPackSchema = z.object({
  packageId: z.string().trim().min(1).max(200), version: z.string().trim().min(1).max(100), effectiveFrom: calendarDateSchema, effectiveUntil: calendarDateSchema.nullable(),
  status: z.enum(["candidate", "approved", "retired"]), approvalState: z.enum(["blocked", "approved"]),
  sourceReferences: z.array(z.object({ id: z.string().trim().min(1).max(200), uri: z.string().url(), digest: sha256Schema }).strict()).min(1).max(200),
  sourceDigest: sha256Schema, rules: z.array(ruleSchema).min(1).max(5_000), dependencies: z.array(dependencySchema).max(10_000),
  officialStatus: z.object({ state: z.enum(["current", "superseded", "stayed", "unknown"]), checkedAt: z.string().datetime({ offset: true }), sourceReferenceIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100) }).strict(),
}).strict().refine((value) => value.effectiveUntil === null || value.effectiveUntil >= value.effectiveFrom, "invalid effective window");
