import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import type { Sha256Hex } from "../governance/source-types.ts";
import { isPrimaryAuthority } from "../governance/source-policy.ts";
import type { ClinicalAuthority } from "../governance/source-types.ts";
import {
  approvedGuidanceBlockSchema,
  nutritionContentProvenanceSchema,
  recipeTemplateSchema,
  type ApprovedGuidanceBlock,
  type NutritionContentProvenance,
  type NutritionSourceProvenance,
  type RecipeTemplate,
} from "./types.ts";

const DIGEST = /^[0-9a-f]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/;

export const CONVEYED_APPROVAL_RECORD_SHA256 = "7174f9b96ec3f780f95e915b08f3525a89374f922fe253af25a4afc43375fc00" as Sha256Hex;
export const NUTRITION_CONTENT_ALGORITHM_VERSION = "nutrition-content.v1";

export type NutritionContentApproval = Readonly<{
  status: "approved" | "withdrawn" | "revoked";
  current: boolean;
  revoked: boolean;
  digest: Sha256Hex;
  recordDigest: Sha256Hex;
  approvedArtifactSha256: Sha256Hex;
  packageId: string;
  packageVersion: string;
}>;

export type NutritionContentEvidence = Readonly<{
  packageDigest: Sha256Hex;
  sourceDigest: Sha256Hex;
  licenseDigest: Sha256Hex;
  artifactDigest: Sha256Hex;
  algorithmDigest: Sha256Hex;
  fixtureDigest: Sha256Hex;
  rightsDigest: Sha256Hex;
  translationDigest: Sha256Hex;
}>;

export type NutritionGovernedSource = Readonly<{
  sourceId: string;
  sourceVersion: string;
  authority: ClinicalAuthority;
  jurisdiction: "CO" | "US" | "GLOBAL";
  domain: "nutrition";
  title: string;
  citation: string | null;
  sourceUri: string;
  publishedAt: string | null;
  retrievedAt: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  license: string;
  artifactSha256: Sha256Hex;
  status: "approved";
}>;

/** Exact, immutable package shape accepted by the loader. */
export type NutritionContentManifest = Readonly<{
  packageId: string;
  packageVersion: string;
  jurisdiction: "CO" | "US";
  locale: "es-CO" | "en-US";
  effectiveFrom: string;
  effectiveUntil: string | null;
  algorithmVersion: string;
  fixturesSha256: Sha256Hex;
  rightsSha256: Sha256Hex;
  translation: "original" | "translated" | "adapted";
  sources: readonly NutritionGovernedSource[];
  blocks: readonly ApprovedGuidanceBlock[];
  recipes: readonly RecipeTemplate[];
  artifactSha256: Sha256Hex;
  status: "draft" | "released" | "retired" | "revoked";
  current: boolean;
  revoked: boolean;
  approval: NutritionContentApproval;
  evidence: NutritionContentEvidence;
}>;

export type NutritionContentSelectionContext = Readonly<{
  countryOfCare: "CO" | "US";
  locale: "es-CO" | "en-US";
  asOf: Date | string;
  timeZone?: string;
}>;

export type NutritionContentUnavailableReason =
  | "INVALID_CONTEXT" | "NO_CANDIDATE" | "JURISDICTION_MISMATCH" | "LOCALE_MISMATCH"
  | "EFFECTIVE_WINDOW_INVALID" | "NOT_RELEASED" | "NOT_CURRENT" | "REVOKED"
  | "SOURCE_UNAVAILABLE" | "LICENSE_UNAVAILABLE" | "RIGHTS_UNAVAILABLE"
  | "TRANSLATION_UNAVAILABLE" | "FIXTURE_UNAVAILABLE" | "ALGORITHM_UNAVAILABLE"
  | "APPROVAL_UNAVAILABLE" | "CHECKSUM_MISMATCH" | "DUPLICATE_CONTENT_ID"
  | "UNSAFE_CONTENT" | "AMBIGUOUS_CANDIDATE";

export type NutritionContentResolution =
  | Readonly<{ ok: true; value: Readonly<{
    manifest: NutritionContentManifest;
    blocks: readonly ApprovedGuidanceBlock[];
    recipes: readonly RecipeTemplate[];
    packageId: string;
    packageVersion: string;
    artifactSha256: Sha256Hex;
    sourceDigest: Sha256Hex;
    sourceDigests: readonly Sha256Hex[];
    licenseDigest: Sha256Hex;
    rightsDigest: Sha256Hex;
    algorithmDigest: Sha256Hex;
    fixtureDigest: Sha256Hex;
    translationDigest: Sha256Hex;
    approvalDigest: Sha256Hex;
    approvalRecordDigest: Sha256Hex;
    digest: Sha256Hex;
  }> }>
  | Readonly<{ ok: false; code: "NUTRITION_CONTENT_UNAVAILABLE"; reason: NutritionContentUnavailableReason; digest: Sha256Hex }>;

const digestSchema = z.string().regex(DIGEST);
const approvalSchema = z.object({
  status: z.enum(["approved", "withdrawn", "revoked"]),
  current: z.boolean(), revoked: z.boolean(), digest: digestSchema,
  recordDigest: digestSchema, approvedArtifactSha256: digestSchema,
  packageId: z.string().regex(CODE), packageVersion: z.string().regex(CODE),
}).strict();
const evidenceSchema = z.object({
  packageDigest: digestSchema, sourceDigest: digestSchema, licenseDigest: digestSchema,
  artifactDigest: digestSchema, algorithmDigest: digestSchema, fixtureDigest: digestSchema,
  rightsDigest: digestSchema, translationDigest: digestSchema,
}).strict();
const governedSourceSchema = z.object({
  sourceId: z.string().regex(CODE), sourceVersion: z.string().regex(CODE),
  authority: z.enum(["MINSALUD_PAI", "CDC_ACIP", "WHO", "INVIMA", "NLM_DAILYMED", "NLM_RXNORM", "FDA"]),
  jurisdiction: z.enum(["CO", "US", "GLOBAL"]), domain: z.literal("nutrition"),
  title: z.string().min(1).max(500), citation: z.string().max(2000).nullable(),
  sourceUri: z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS source URI"),
  publishedAt: z.string().refine(isIsoDate, "ISO date").nullable(),
  retrievedAt: z.string().refine(isOffsetInstant, "ISO instant"),
  effectiveFrom: z.string().refine(isIsoDate, "ISO date").nullable(),
  effectiveUntil: z.string().refine(isIsoDate, "ISO date").nullable(),
  license: z.string().min(1).max(500), artifactSha256: digestSchema, status: z.literal("approved"),
}).strict().superRefine((source, refinement) => {
  if (source.effectiveFrom !== null && source.effectiveUntil !== null && source.effectiveUntil < source.effectiveFrom) {
    refinement.addIssue({ code: "custom", path: ["effectiveUntil"], message: "invalid source effective window" });
  }
});
const manifestSchema = z.object({
  packageId: z.string().regex(CODE), packageVersion: z.string().regex(CODE),
  jurisdiction: z.enum(["CO", "US"]), locale: z.enum(["es-CO", "en-US"]),
  effectiveFrom: z.string().refine(isIsoDate, "ISO date"),
  effectiveUntil: z.string().refine(isIsoDate, "ISO date").nullable(),
  algorithmVersion: z.string().regex(CODE), fixturesSha256: digestSchema, rightsSha256: digestSchema,
  translation: z.enum(["original", "translated", "adapted"]),
  sources: z.array(governedSourceSchema).max(100).readonly(),
  blocks: z.array(approvedGuidanceBlockSchema).max(100).readonly(),
  recipes: z.array(recipeTemplateSchema).max(100).readonly(), artifactSha256: digestSchema,
  status: z.enum(["draft", "released", "retired", "revoked"]), current: z.boolean(), revoked: z.boolean(),
  approval: approvalSchema, evidence: evidenceSchema,
}).strict();

type RecordValue = Record<string, unknown>;
type ArtifactFields = Pick<NutritionContentManifest, "packageId" | "packageVersion" | "jurisdiction" | "locale" | "effectiveFrom" | "effectiveUntil" | "algorithmVersion" | "fixturesSha256" | "rightsSha256" | "translation" | "sources" | "blocks" | "recipes" | "status" | "current" | "revoked">;

function isRecord(value: unknown): value is RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isDigest(value: unknown): value is Sha256Hex { return typeof value === "string" && DIGEST.test(value); }
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function hash(value: unknown): Sha256Hex { return createHash("sha256").update(canonicalize(value), "utf8").digest("hex") as Sha256Hex; }
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object); for (const child of Object.values(value as RecordValue)) freeze(child, seen);
  return Object.freeze(value);
}
function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number); const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}
function isOffsetInstant(value: unknown): value is string {
  return typeof value === "string" && OFFSET_INSTANT.test(value) && Number.isFinite(Date.parse(value));
}
function orderedProvenanceSources(sources: readonly NutritionSourceProvenance[]): readonly NutritionSourceProvenance[] {
  return [...sources].sort((left, right) => compare(left.sourceId, right.sourceId) || compare(left.sourceUri, right.sourceUri) || compare(left.artifactSha256, right.artifactSha256));
}
function orderedSources(sources: readonly NutritionGovernedSource[]): readonly NutritionGovernedSource[] {
  return [...sources].sort((left, right) => compare(left.sourceId, right.sourceId) || compare(left.sourceUri, right.sourceUri) || compare(left.artifactSha256, right.artifactSha256));
}
function sourceSummaries(sources: readonly NutritionGovernedSource[]): readonly NutritionSourceProvenance[] {
  return orderedSources(sources).map(({ sourceId, sourceUri, sourceVersion, artifactSha256, license, retrievedAt }) => ({
    sourceId, sourceUri, sourceVersion, artifactSha256, license, retrievedAt,
  }));
}
function noArtifact(provenance: NutritionContentProvenance): RecordValue {
  const { artifactSha256: _artifactSha256, sources, ...rest } = provenance;
  return { ...rest, sources: orderedProvenanceSources(sources) };
}
function noSelfHash(item: ApprovedGuidanceBlock | RecipeTemplate): unknown {
  const { provenance, ...rest } = item;
  return { ...rest, provenance: noArtifact(provenance) };
}

function artifactMaterial(input: unknown): ArtifactFields | null {
  if (!isRecord(input) || !Array.isArray(input.sources) || !Array.isArray(input.blocks) || !Array.isArray(input.recipes)) return null;
  const fields = input as unknown as ArtifactFields;
  return {
    packageId: fields.packageId, packageVersion: fields.packageVersion, jurisdiction: fields.jurisdiction, locale: fields.locale,
    effectiveFrom: fields.effectiveFrom, effectiveUntil: fields.effectiveUntil, algorithmVersion: fields.algorithmVersion,
    fixturesSha256: fields.fixturesSha256, rightsSha256: fields.rightsSha256, translation: fields.translation,
    status: fields.status, current: fields.current, revoked: fields.revoked,
    sources: orderedSources(fields.sources),
    blocks: [...fields.blocks].sort((left, right) => compare(left.id, right.id)).map(noSelfHash) as ApprovedGuidanceBlock[],
    recipes: [...fields.recipes].sort((left, right) => compare(left.id, right.id)).map(noSelfHash) as RecipeTemplate[],
  };
}

/** Hashes all package identity and content fields, excluding only content self-hashes. */
export function computeNutritionContentArtifactSha256(input: unknown): Sha256Hex {
  const material = artifactMaterial(input); return hash(material ?? input);
}

export function computeNutritionContentEvidence(input: ArtifactFields & { artifactSha256: Sha256Hex }): NutritionContentEvidence {
  const sources = orderedSources(input.sources);
  return {
    packageDigest: hash({ packageId: input.packageId, packageVersion: input.packageVersion, jurisdiction: input.jurisdiction, locale: input.locale, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, status: input.status, current: input.current, revoked: input.revoked }),
    sourceDigest: hash(sources),
    licenseDigest: hash(sources.map(({ sourceId, license }) => ({ sourceId, license })).sort((left, right) => compare(left.sourceId, right.sourceId) || compare(left.license, right.license))),
    artifactDigest: input.artifactSha256,
    algorithmDigest: hash({ algorithmVersion: input.algorithmVersion }),
    fixtureDigest: input.fixturesSha256,
    rightsDigest: input.rightsSha256,
    translationDigest: hash(input.translation),
  };
}

function contextDate(context: unknown): { date: string; instant: string } | null {
  if (!isRecord(context)) return null;
  const value = context.asOf; const timeZone = context.timeZone === undefined ? "UTC" : context.timeZone;
  if (typeof timeZone !== "string" || timeZone.trim() === "") return null;
  if (typeof value === "string" && isIsoDate(value)) return { date: value, instant: `${value}T00:00:00.000Z` };
  const date = value instanceof Date ? (Number.isFinite(value.getTime()) ? new Date(value) : null)
    : typeof value === "string" && OFFSET_INSTANT.test(value) && isIsoDate(value.slice(0, 10)) ? new Date(value) : null;
  if (date === null || !Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); const local = `${values.year}-${values.month}-${values.day}`;
    return isIsoDate(local) ? { date: local, instant: date.toISOString() } : null;
  } catch { return null; }
}

function safeText(value: string): boolean {
  const clinical = /\b(?:diagnos(?:e|ed|es|is|tic)|diagn[oó]stic\w*|trat(?:amiento|ar)|treat(?:ment|s|ed)?|prescri|prescripci|medicat|medicamento|terap(?:ia|y)|cure?|cura(?:r|ción)?|enfermedad|disease|desnutric|malnutrition|trastorno\s+aliment|feeding\s+disorder|screen(?:ing)?|tamizaje|cribado|autism|autismo|retraso|delay|ead\s*[-–—]?\s*3|professional\s+instrument|instrumento\s+profesional)\b/i;
  const reassurance = /\b(?:guarantee|guaranteed|garantiz|promise|promes|prevent(?:s|ed|ing|ion)?|prev(?:enir|iene|ención)|risk[-\s]*free|allerg(?:y|ies)[-\s]*free|libre\s+de\s+alerg(?:ia|ias)|sin\s+riesgo|no\s+(?:hay\s+)?riesgo|safe|segur[oa]s?|nothing\s+to\s+worry|no\s+te\s+preocupes|tranquil[oa])\b/i;
  const endorsement = /\b(?:endorse|endorsed|recom(?:mend)?(?:ed|ation)?\s+(?:a\s+)?(?:brand|marca|product|producto)|brand|marca|product(?:o|s)?|sponsor|patrocin|buy|purchase|compr(?:a|ar)|advertis|publicidad)\b/i;
  const bypass = /\b(?:ignore|disregard|omit|skip|override|bypass|omitir|omite|ignora|saltar|saltarse|despite|regardless|a\s+pesar|sin|no|nunca|zero|cero)\b[^.]{0,120}\b(?:allerg(?:y|ies)?|allergen\w*|alerg(?:ia|ias)?|chok(?:e|ing)?|atrag(?:antamiento|arse)?|asfix(?:ia|iar)?|supervis(?:ion|e|ed)?|vigilancia|adult\s+supervision|supervisi[oó]n)\b|\b(?:allerg(?:y|ies)?|allergen\w*|alerg(?:ia|ias)?|chok(?:e|ing)?|atrag(?:antamiento|arse)?|asfix(?:ia|iar)?)\b[^.]{0,120}\b(?:challenge|reintroduc\w*|desaf[ií]o|ignore|bypass|safe|segur\w*|risk[-\s]*free|sin\s+riesgo|no\s+riesgo)\b|\b(?:without|skip|omit|no|never|sin|omitir|saltar)\b[^.]{0,50}\b(?:adult\s+)?(?:supervision|supervisi[oó]n|vigilancia)\b/i;
  const prompt = /(?:ignore\s+(?:all\s+)?(?:previous|prior|earlier|preceding|above|system|developer|assistant)\s+instructions?|disregard\s+(?:all\s+)?(?:previous|prior|earlier|system|developer)?\s*instructions?|forget\s+(?:all\s+)?(?:previous|prior)\s+instructions?|ignora(?:\s+(?:todas?\s+)?(?:las\s+)?instrucciones)?\s*(?:anteriores|previas|del\s+sistema|del\s+desarrollador)?|omite\s+(?:las\s+)?instrucciones|prompt\s+injection|system\s+prompt|developer\s+prompt|jailbreak|tool\s+call|function\s+call|<\/?(?:system|assistant|developer)\b|<\|(?:system|assistant|developer)\|>|\b(?:you\s+are|act\s+as|eres|act[uú]a\s+como)\b)/i;
  const operations = /\b(?:call|contact|message|text|email|book|schedule|arrange|request|make)\b[^.]{0,80}\b(?:your\s+)?(?:doctor|pediatrician|paediatrician|clinician|provider|medical\s+team|healthcare\s+professional|appointment|visit)\b|\b(?:llama|contacta|escribe|env[ií]a|manda|comun[ií]cate)\b[^.]{0,80}\b(?:a\s+|con\s+|al\s+|el\s+)?(?:doctor|m[eé]dico|pediatra|profesional|cl[ií]nico)\b|\b(?:agenda|programa|solicita)\b[^.]{0,40}\b(?:una\s+)?(?:cita|consulta|visita)\b/i;
  return clinical.test(value) || reassurance.test(value) || endorsement.test(value) || bypass.test(value) || prompt.test(value) || operations.test(value);
}

function hasUnsafe(manifest: NutritionContentManifest): boolean {
  const visible = [
    manifest.packageId, manifest.packageVersion, manifest.locale, manifest.algorithmVersion, manifest.translation,
    ...manifest.sources.flatMap((source) => [source.sourceId, source.sourceVersion, source.authority, source.title, source.citation ?? "", source.sourceUri, source.license]),
    ...manifest.blocks.flatMap((block) => [block.id, block.title, block.text, ...block.tags]),
    ...manifest.recipes.flatMap((recipe) => [recipe.id, recipe.title, ...recipe.ingredientCodes, ...recipe.guidanceBlockIds, ...recipe.exclusionCodes, ...recipe.preparationSteps]),
  ];
  return visible.some(safeText);
}

function sameProvenance(left: NutritionContentProvenance, right: NutritionContentProvenance): boolean {
  return canonicalize(noArtifact(left)) === canonicalize(noArtifact(right)) && left.artifactSha256 === right.artifactSha256;
}

function failure(reason: NutritionContentUnavailableReason, context: unknown): NutritionContentResolution {
  try {
    let safe: RecordValue = {};
    if (isRecord(context)) {
      const countryOfCare = context.countryOfCare;
      const locale = context.locale;
      const asOf = context.asOf;
      safe = {
        countryOfCare: countryOfCare === "CO" || countryOfCare === "US" ? countryOfCare : "",
        locale: typeof locale === "string" ? locale : "",
        asOf: typeof asOf === "string" ? asOf : asOf instanceof Date ? "date" : typeof asOf,
      };
    }
    return { ok: false, code: "NUTRITION_CONTENT_UNAVAILABLE", reason, digest: hash({ code: "NUTRITION_CONTENT_UNAVAILABLE", reason, context: safe }) };
  }
  catch { return { ok: false, code: "NUTRITION_CONTENT_UNAVAILABLE", reason, digest: "0".repeat(64) as Sha256Hex }; }
}

function validContext(context: unknown): context is NutritionContentSelectionContext {
  if (!isRecord(context) || Object.keys(context).some((key) => !["countryOfCare", "locale", "asOf", "timeZone"].includes(key))) return false;
  if ((context.countryOfCare !== "CO" && context.countryOfCare !== "US") || (context.locale !== "es-CO" && context.locale !== "en-US")) return false;
  if (context.locale !== (context.countryOfCare === "CO" ? "es-CO" : "en-US") || contextDate(context) === null) return false;
  return context.timeZone === undefined || typeof context.timeZone === "string";
}

function candidateReason(manifest: NutritionContentManifest, context: NutritionContentSelectionContext, selectedDate: string): NutritionContentUnavailableReason | null {
  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) return "CHECKSUM_MISMATCH";
  const value = parsed.data as NutritionContentManifest;
  if (value.blocks.length === 0 && value.recipes.length === 0) return "NO_CANDIDATE";
  if (value.jurisdiction !== context.countryOfCare) return "JURISDICTION_MISMATCH";
  if (value.locale !== context.locale) return "LOCALE_MISMATCH";
  if (value.effectiveUntil !== null && value.effectiveUntil < value.effectiveFrom) return "EFFECTIVE_WINDOW_INVALID";
  if (value.effectiveFrom > selectedDate || (value.effectiveUntil !== null && value.effectiveUntil < selectedDate)) return "EFFECTIVE_WINDOW_INVALID";
  if (value.revoked || value.status === "revoked") return "REVOKED";
  if (value.status !== "released") return "NOT_RELEASED";
  if (!value.current) return "NOT_CURRENT";
  if (value.sources.length === 0) return "SOURCE_UNAVAILABLE";
  if (value.sources.some((source) => !isPrimaryAuthority(source.authority, source.jurisdiction, source.domain))) return "SOURCE_UNAVAILABLE";
  if (value.sources.some((source) => source.jurisdiction !== value.jurisdiction && source.jurisdiction !== "GLOBAL")) return "JURISDICTION_MISMATCH";
  if (value.sources.some((source) => (source.publishedAt !== null && source.publishedAt > selectedDate)
    || source.retrievedAt.slice(0, 10) > selectedDate
    || (source.effectiveFrom !== null && source.effectiveFrom > selectedDate)
    || (source.effectiveUntil !== null && source.effectiveUntil < selectedDate))) return "SOURCE_UNAVAILABLE";
  const ids = value.sources.map((source) => source.sourceId); const sourceDigests = value.sources.map((source) => source.artifactSha256);
  if (new Set(ids).size !== ids.length || new Set(sourceDigests).size !== sourceDigests.length) return "SOURCE_UNAVAILABLE";
  if (value.sources.some((source) => source.license.trim() === "")) return "LICENSE_UNAVAILABLE";
  if (!isDigest(value.rightsSha256)) return "RIGHTS_UNAVAILABLE";
  if (value.translation !== "original" && value.translation !== "translated" && value.translation !== "adapted") return "TRANSLATION_UNAVAILABLE";
  if (value.algorithmVersion !== NUTRITION_CONTENT_ALGORITHM_VERSION) return "ALGORITHM_UNAVAILABLE";
  if (new Set([...value.blocks, ...value.recipes].map((item) => item.id)).size !== value.blocks.length + value.recipes.length) return "DUPLICATE_CONTENT_ID";
  if (hasUnsafe(value)) return "UNSAFE_CONTENT";
  const provenance: NutritionContentProvenance = {
    packageId: value.packageId, packageVersion: value.packageVersion, algorithmVersion: value.algorithmVersion,
    fixturesSha256: value.fixturesSha256, rightsSha256: value.rightsSha256, jurisdiction: value.jurisdiction,
    locale: value.locale, effectiveFrom: value.effectiveFrom, effectiveUntil: value.effectiveUntil,
    translation: value.translation, artifactSha256: value.artifactSha256, approvalDigest: value.approval.digest,
    sources: sourceSummaries(value.sources),
  };
  if ([...value.blocks, ...value.recipes].some((item) => !sameProvenance(item.provenance, provenance))) return "CHECKSUM_MISMATCH";
  if (computeNutritionContentArtifactSha256(value) !== value.artifactSha256) return "CHECKSUM_MISMATCH";
  if (value.approval.status !== "approved" || !value.approval.current || value.approval.revoked
    || value.approval.recordDigest !== CONVEYED_APPROVAL_RECORD_SHA256
    || value.approval.approvedArtifactSha256 !== value.artifactSha256
    || value.approval.packageId !== value.packageId || value.approval.packageVersion !== value.packageVersion
    || value.approval.digest !== provenance.approvalDigest) return "APPROVAL_UNAVAILABLE";
  const expectedEvidence = computeNutritionContentEvidence({ ...value, artifactSha256: value.artifactSha256 });
  if (canonicalize(value.evidence) !== canonicalize(expectedEvidence)) return "CHECKSUM_MISMATCH";
  return null;
}

function normalize(manifest: NutritionContentManifest): NutritionContentManifest {
  const sources = Object.freeze(orderedSources(manifest.sources));
  const summaries = Object.freeze(sourceSummaries(sources));
  const blocks = Object.freeze([...manifest.blocks].sort((left, right) => compare(left.id, right.id)).map((block) => ({ ...block, provenance: { ...block.provenance, sources: summaries } })));
  const recipes = Object.freeze([...manifest.recipes].sort((left, right) => compare(left.id, right.id)).map((recipe) => ({ ...recipe, provenance: { ...recipe.provenance, sources: summaries } })));
  return freeze({ ...manifest, sources, blocks, recipes });
}

export function loadNutritionContent(context: NutritionContentSelectionContext, manifests: readonly NutritionContentManifest[]): NutritionContentResolution {
  try {
    if (!validContext(context) || !Array.isArray(manifests)) return failure("INVALID_CONTEXT", context);
    const selectedDate = contextDate(context)?.date;
    if (selectedDate === undefined) return failure("INVALID_CONTEXT", context);
    if (manifests.length === 0) return failure("NO_CANDIDATE", context);
    const valid: NutritionContentManifest[] = []; const reasons: NutritionContentUnavailableReason[] = [];
    for (const manifest of manifests) {
      const reason = candidateReason(manifest, context, selectedDate);
      if (reason === null) valid.push(normalize(manifest)); else reasons.push(reason);
    }
    if (valid.length === 0) {
      const priority: readonly NutritionContentUnavailableReason[] = ["REVOKED", "APPROVAL_UNAVAILABLE", "CHECKSUM_MISMATCH", "UNSAFE_CONTENT", "RIGHTS_UNAVAILABLE", "SOURCE_UNAVAILABLE", "LICENSE_UNAVAILABLE", "TRANSLATION_UNAVAILABLE", "ALGORITHM_UNAVAILABLE", "FIXTURE_UNAVAILABLE", "NOT_RELEASED", "NOT_CURRENT", "EFFECTIVE_WINDOW_INVALID", "LOCALE_MISMATCH", "JURISDICTION_MISMATCH", "DUPLICATE_CONTENT_ID", "NO_CANDIDATE"];
      return failure(priority.find((item) => reasons.includes(item)) ?? "NO_CANDIDATE", context);
    }
    if (valid.length !== 1) return failure("AMBIGUOUS_CANDIDATE", context);
    const manifest = valid[0]!; const sourceDigests = Object.freeze(manifest.sources.map((source) => source.artifactSha256).sort(compare));
    const evidence = manifest.evidence;
    return { ok: true, value: freeze({
      manifest, blocks: manifest.blocks, recipes: manifest.recipes, packageId: manifest.packageId, packageVersion: manifest.packageVersion,
      artifactSha256: manifest.artifactSha256, sourceDigest: evidence.sourceDigest, sourceDigests, licenseDigest: evidence.licenseDigest,
      rightsDigest: evidence.rightsDigest, algorithmDigest: evidence.algorithmDigest, fixtureDigest: evidence.fixtureDigest,
      translationDigest: evidence.translationDigest, approvalDigest: manifest.approval.digest, approvalRecordDigest: manifest.approval.recordDigest,
      digest: hash({ packageId: manifest.packageId, packageVersion: manifest.packageVersion, jurisdiction: manifest.jurisdiction, locale: manifest.locale, artifactSha256: manifest.artifactSha256, blockIds: manifest.blocks.map((block) => block.id), recipeIds: manifest.recipes.map((recipe) => recipe.id) }),
    }) };
  } catch { return failure("CHECKSUM_MISMATCH", context); }
}
