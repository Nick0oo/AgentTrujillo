import { z } from "zod";

import type { RulePackArtifactV1 } from "./artifact-types.ts";

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const LOCALE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8})*$/;

export const DEFAULT_ARTIFACT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 20_000,
});

const dateSchema = z.string().regex(ISO_DATE);
const digestSchema = z.string().regex(SHA256);
const sourceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  purpose: z.string().min(1),
  artifactSha256: digestSchema,
}).strict();
const algorithmSchema = z.object({
  key: z.string().min(1),
  version: z.string().regex(SEMVER),
  implementationSha256: digestSchema,
  supportedSchemaVersion: z.literal("1"),
}).strict();

const headerSchema = z.object({
  schemaVersion: z.literal("1"),
  domain: z.enum(["growth", "immunization", "medication", "development", "nutrition", "emergency"]),
  countryCode: z.enum(["CO", "US", "GLOBAL"]),
  locale: z.string().regex(LOCALE),
  version: z.string().regex(SEMVER),
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema.nullable(),
  algorithm: algorithmSchema,
  sourceReferences: z.array(sourceReferenceSchema).min(1),
  payloadSchema: z.string().min(1),
}).strict().superRefine((header, context) => {
  if (header.effectiveUntil !== null && header.effectiveUntil < header.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "effectiveUntil precedes effectiveFrom" });
  }
});

export const rulePackArtifactV1Schema = z.object({
  schemaVersion: z.literal("1"),
  header: headerSchema,
  payload: z.unknown(),
  fixtures: z.array(z.record(z.string(), z.unknown())),
}).strict();

export type ParsedRulePackArtifactV1<T = unknown> = RulePackArtifactV1<T>;

export { headerSchema, algorithmSchema, sourceReferenceSchema };
