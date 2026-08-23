import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import { CAREGIVER_FRAMEWORK_DISCLAIMER } from "./framework-resolver.ts";
import {
  developmentFrameworkSchema,
  type DevelopmentFramework,
} from "./types.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

const boundedText = z.string().min(1).max(512);
const boundaryRequestSchema = z.object({
  routeId: boundedText,
  toolId: boundedText.nullable(),
  capability: z.enum([
    "caregiver_education",
    "caregiver_observation",
    "framework_lookup",
    "attachment_reference",
    "screening",
    "administration",
    "scoring",
    "classification",
    "interpretation",
    "item_access",
    "response_capture",
  ]),
  identifiers: z.array(boundedText).max(32).readonly(),
  requestedFields: z.array(boundedText).max(32).readonly(),
  tags: z.array(boundedText).max(32).readonly(),
  artifactIds: z.array(boundedText).max(32).readonly(),
  attachmentLabels: z.array(boundedText).max(16).readonly(),
  contentFragments: z.array(z.string().min(1).max(2_000)).max(32).readonly(),
}).strict();

export type ProfessionalFrameworkBoundaryRequest = Readonly<z.infer<typeof boundaryRequestSchema>>;

export type ProfessionalFrameworkBoundaryContext = Readonly<{
  cutoff: Date;
  revalidatedScope: AuthorizedChildScope | null;
  surface: "consumer" | "model";
  /** Trusted result from the AT-08-10 framework resolver, never request or model input. */
  framework: DevelopmentFramework | null;
  professionalArtifactIds: readonly string[];
  /** Informational only: entitlements never authorize a professional instrument. */
  entitlements: readonly string[];
}>;

export type ProfessionalFrameworkBoundaryReason =
  | "CAREGIVER_SURFACE_ALLOWED"
  | "NOT_AUTHORIZED"
  | "INVALID_REQUEST"
  | "INVALID_CONTEXT"
  | "FRAMEWORK_UNAVAILABLE"
  | "PROFESSIONAL_ONLY"
  | "UNSUPPORTED_SURFACE"
  | "UNTRUSTED_INSTRUCTION";

export type ProfessionalFrameworkBoundaryResult = Readonly<{
  allowed: boolean;
  disposition: "caregiver_only" | "denied";
  audit: Readonly<{
    event: "development_professional_boundary";
    reasonCode: ProfessionalFrameworkBoundaryReason;
    requestSha256: Sha256Hex;
  }>;
}>;

const ALLOWED_CAPABILITIES = new Set<ProfessionalFrameworkBoundaryRequest["capability"]>([
  "caregiver_education",
  "caregiver_observation",
  "framework_lookup",
  "attachment_reference",
]);
const ALLOWED_ROUTES = new Set(["development_milestones", "development_observation"]);
const ALLOWED_TOOLS = new Set(["record-development-observation"]);
const ALLOWED_FIELDS = new Set([
  "id",
  "domain",
  "title",
  "caregivercopy",
  "text",
  "date",
  "concern",
  "attachments",
  "milestoneid",
]);
const PROFESSIONAL_FIELD = /^(?:items?|responses?|rawscore|standardscore|score|scoring|cutoff|classification|examinerinstructions|administration|developmentalage)$/u;
const INSTRUCTION_ATTACK = /(?:ignore|disregard|override|bypass|reveal|expose|leak|print|decode|extract).{0,80}(?:instruction|policy|system|developer|hidden|private|professional|instrument|test)|(?:ignora|omite|anula|evade|revela|muestra|filtra|extrae).{0,80}(?:instrucci[oó]n|pol[ií]tica|sistema|ocult[oa]|privad[oa]|profesional|instrumento|prueba)|jailbreak|prompt\s*injection/iu;
const PROFESSIONAL_MARKER = /(?:ead3|escalaabreviadadedesarrollo|professionalinstrument|instrumentoprofesional|screening|tamizaje|tamiz|cribado|scoring|score|puntaje|puntuacion|cutoff|umbral|classification|clasificacion|examiner|evaluador|administration|administracion|developmentalage|edaddeldesarrollo)/u;

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(value))).digest("hex") as Sha256Hex;
}

function safeDigest(value: unknown): Sha256Hex {
  try {
    return digest(value);
  } catch {
    return digest({ invalid: true });
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function result(
  allowed: boolean,
  reasonCode: ProfessionalFrameworkBoundaryReason,
  requestSha256: Sha256Hex,
): ProfessionalFrameworkBoundaryResult {
  return deepFreeze({
    allowed,
    disposition: allowed ? "caregiver_only" as const : "denied" as const,
    audit: {
      event: "development_professional_boundary" as const,
      reasonCode,
      requestSha256,
    },
  });
}

function decodeEntities(value: string): string {
  return value.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/giu, (_match, hex: string | undefined, decimal: string | undefined) => {
    const codePoint = Number.parseInt(hex ?? decimal ?? "", hex === undefined ? 10 : 16);
    try {
      return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : "";
    } catch {
      return "";
    }
  });
}

function decodedVariants(value: string): readonly string[] {
  const variants = new Set<string>([value, decodeEntities(value)]);
  let percentDecoded = value;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(percentDecoded);
      variants.add(decoded);
      if (decoded === percentDecoded) break;
      percentDecoded = decoded;
    } catch {
      break;
    }
  }
  for (const variant of [...variants]) {
    const tokens = variant.match(/[A-Za-z0-9+/]{4,}={0,2}/gu) ?? [];
    for (const token of tokens) {
      if (token.length % 4 !== 0) continue;
      try {
        const decoded = Buffer.from(token, "base64").toString("utf8");
        if (/^[\x20-\x7E]+$/u.test(decoded)) variants.add(decoded);
      } catch {
        // A malformed encoded token remains untrusted text and is inspected as-is.
      }
    }
  }
  return Object.freeze([...variants]);
}

function compact(value: string): string {
  return value.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "");
}

function professionalMarker(value: string): boolean {
  return decodedVariants(value).some((variant) => PROFESSIONAL_MARKER.test(compact(variant)));
}

function instructionAttack(values: readonly string[]): boolean {
  return values.some((value) => decodedVariants(value).some((variant) => INSTRUCTION_ATTACK.test(variant)));
}

function currentScope(request: AuthorizedChildScope, fresh: AuthorizedChildScope | null, cutoff: Date): fresh is AuthorizedChildScope {
  return fresh !== null
    && hasPermission(request, "read", cutoff)
    && hasPermission(fresh, "read", cutoff)
    && sameAuthorizedChildScope(request, fresh)
    && request.countryOfCare === fresh.countryOfCare
    && request.timezone === fresh.timezone
    && fresh.permissions.every((permission) => request.permissions.includes(permission));
}

function validContext(context: ProfessionalFrameworkBoundaryContext): boolean {
  return context.surface === "consumer" || context.surface === "model"
    ? Array.isArray(context.professionalArtifactIds)
      && context.professionalArtifactIds.length <= 100
      && context.professionalArtifactIds.every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)
      && Array.isArray(context.entitlements)
      && context.entitlements.length <= 100
      && context.entitlements.every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)
    : false;
}

type ParsedDevelopmentFramework = z.infer<typeof developmentFrameworkSchema>;

function validCaregiverFramework(framework: Extract<ParsedDevelopmentFramework, { audience: "caregiver" }>, scope: AuthorizedChildScope, cutoffDate: string): boolean {
  if (framework.disclaimer !== CAREGIVER_FRAMEWORK_DISCLAIMER
    || framework.provenance.jurisdiction !== scope.countryOfCare
    || framework.provenance.locale !== (scope.countryOfCare === "CO" ? "es-CO" : "en-US")
    || cutoffDate < framework.provenance.effectiveFrom
    || (framework.provenance.effectiveUntil !== null && cutoffDate > framework.provenance.effectiveUntil)) return false;
  const visibleMetadata = [
    framework.id,
    framework.version,
    framework.provenance.packageId,
    framework.provenance.packageVersion,
    framework.provenance.algorithmVersion,
    ...framework.items.flatMap((item) => [item.id, item.title, item.caregiverCopy]),
    ...framework.provenance.sources.flatMap((source) => [source.sourceId, source.sourceVersion, source.sourceUri, source.license]),
  ];
  return !visibleMetadata.some(professionalMarker);
}

function localDate(cutoff: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(cutoff);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

/** Consumer/model boundary only. No administration, response, scoring, or interpretation API is exported. */
export function enforceProfessionalFrameworkBoundary(
  requestScope: AuthorizedChildScope,
  rawRequest: ProfessionalFrameworkBoundaryRequest,
  context: ProfessionalFrameworkBoundaryContext,
): ProfessionalFrameworkBoundaryResult {
  const parsedRequest = boundaryRequestSchema.safeParse(rawRequest);
  const requestSha256 = safeDigest(parsedRequest.success ? parsedRequest.data : { invalidRequest: true });
  if (!parsedRequest.success) return result(false, "INVALID_REQUEST", requestSha256);
  const cutoff = context.cutoff;
  if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime()) || !currentScope(requestScope, context.revalidatedScope, cutoff)) {
    return result(false, "NOT_AUTHORIZED", requestSha256);
  }
  if (!validContext(context)) return result(false, "INVALID_CONTEXT", requestSha256);
  const frameworkResult = developmentFrameworkSchema.safeParse(context.framework);
  if (!frameworkResult.success) return result(false, "FRAMEWORK_UNAVAILABLE", requestSha256);
  if (frameworkResult.data.kind === "professional_instrument_reference") {
    return result(false, "PROFESSIONAL_ONLY", requestSha256);
  }

  const request = parsedRequest.data;
  if (instructionAttack(request.contentFragments)) return result(false, "UNTRUSTED_INSTRUCTION", requestSha256);
  if (!ALLOWED_CAPABILITIES.has(request.capability)) return result(false, "PROFESSIONAL_ONLY", requestSha256);

  const routeOrTool = [request.routeId, ...(request.toolId === null ? [] : [request.toolId])];
  const requestedMetadata = [
    ...request.identifiers,
    ...request.requestedFields,
    ...request.tags,
    ...request.artifactIds,
    ...request.attachmentLabels,
    ...request.contentFragments,
  ];
  const normalizedFields = request.requestedFields.map(compact);
  if (routeOrTool.some(professionalMarker)
    || requestedMetadata.some(professionalMarker)
    || normalizedFields.some((field) => PROFESSIONAL_FIELD.test(field))
    || request.artifactIds.some((id) => context.professionalArtifactIds.includes(id))) {
    return result(false, "PROFESSIONAL_ONLY", requestSha256);
  }
  if (!ALLOWED_ROUTES.has(request.routeId)
    || (request.toolId !== null && !ALLOWED_TOOLS.has(request.toolId))
    || normalizedFields.some((field) => !ALLOWED_FIELDS.has(field))) {
    return result(false, "UNSUPPORTED_SURFACE", requestSha256);
  }

  const cutoffDate = localDate(cutoff, requestScope.timezone);
  if (cutoffDate === null || !validCaregiverFramework(frameworkResult.data, requestScope, cutoffDate)) {
    return result(false, "FRAMEWORK_UNAVAILABLE", requestSha256);
  }
  return result(true, "CAREGIVER_SURFACE_ALLOWED", requestSha256);
}
