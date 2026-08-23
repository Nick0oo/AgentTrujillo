import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  sameAuthorizedChildScope,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import type { DevelopmentAttachmentProof } from "./observation-validation.ts";
import type { AttachmentReference } from "./types.ts";
import type { Sha256Hex } from "../governance/source-types.ts";

const DIGEST = /^[a-f0-9]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const digestSchema = z.string().regex(DIGEST);
const codeSchema = z.string().regex(CODE);
const uuidSchema = z.string().uuid();
const instantSchema = z.string().datetime({ offset: true });
const dateSchema = z.string().date();
const mediaTypeSchema = z.enum(["application/pdf", "image/jpeg", "image/png"]);
const objectPathSchema = z.string().min(1).max(512)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u)
  .refine((value) => !value.includes("..") && !value.includes("//"));

const policySchema = z.object({
  policyId: codeSchema,
  policyVersion: codeSchema,
  artifactSha256: digestSchema,
  current: z.boolean(),
  revoked: z.boolean(),
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema.nullable(),
  maximumSizeBytes: z.number().int().positive().max(20_971_520),
  allowedMediaTypes: z.array(mediaTypeSchema).min(1).max(3).readonly(),
  allowedRetentionClasses: z.array(z.literal("guardian_controlled")).length(1).readonly(),
}).strict();

const evidenceSchema = z.object({
  documentId: uuidSchema,
  careSpaceId: uuidSchema,
  childId: uuidSchema,
  uploadedBy: uuidSchema,
  purpose: z.enum(["development_observation", "clinical_memory", "other"]),
  storage: z.object({
    bucket: z.enum(["clinical-attachments", "generated-reports"]),
    objectPath: objectPathSchema,
    visibility: z.enum(["private", "public"]),
    permanentUrl: z.string().url().nullable(),
  }).strict(),
  content: z.object({
    declaredMediaType: mediaTypeSchema,
    detectedMediaType: mediaTypeSchema,
    expectedSizeBytes: z.number().int().nonnegative().max(52_428_800),
    actualSizeBytes: z.number().int().nonnegative().max(52_428_800),
    expectedSha256: digestSchema,
    actualSha256: digestSchema,
  }).strict(),
  ticket: z.object({
    audience: z.enum(["private_upload", "private_download"]),
    purpose: z.enum(["development_observation", "clinical_memory"]),
    state: z.enum(["issued", "consumed", "cancelled"]),
    issuedAt: instantSchema,
    expiresAt: instantSchema,
    consumedAt: instantSchema.nullable(),
    upsert: z.boolean(),
    nonceSha256: digestSchema,
    scopeProofSha256: digestSchema,
  }).strict(),
  scan: z.object({
    state: z.enum(["clean", "rejected", "unavailable"]),
    engineId: codeSchema,
    engineVersion: codeSchema,
    signatureVersion: codeSchema,
    scannedAt: instantSchema,
    reportSha256: digestSchema,
  }).strict(),
  processingState: z.enum(["pending", "clean", "rejected", "extracted", "failed"]),
  consent: z.object({
    consentType: z.literal("clinical_attachment"),
    status: z.enum(["granted", "missing", "revoked"]),
    version: codeSchema,
    decisionAt: instantSchema,
    expiresAt: instantSchema.nullable(),
    revokedAt: instantSchema.nullable(),
    recordSha256: digestSchema,
  }).strict(),
  retention: z.object({
    class: z.literal("guardian_controlled"),
    retainUntil: dateSchema,
    policyId: codeSchema,
    policyVersion: codeSchema,
    policySha256: digestSchema,
    current: z.boolean(),
    revoked: z.boolean(),
    effectiveFrom: dateSchema,
    effectiveUntil: dateSchema.nullable(),
  }).strict(),
  lifecycle: z.object({
    state: z.enum(["active", "deleted", "quarantined"]),
    deletedAt: instantSchema.nullable(),
  }).strict(),
}).strict();

export type DevelopmentAttachmentPolicy = Readonly<z.infer<typeof policySchema>>;
export type DevelopmentAttachmentEvidence = Readonly<z.infer<typeof evidenceSchema>>;

export type DevelopmentAttachmentDenyReason =
  | "INVALID_EVIDENCE"
  | "SCOPE_MISMATCH"
  | "OBJECT_PATH_INVALID"
  | "POLICY_UNAVAILABLE"
  | "PUBLIC_ACCESS_FORBIDDEN"
  | "PURPOSE_MISMATCH"
  | "TICKET_INVALID"
  | "TICKET_EXPIRED"
  | "MEDIA_TYPE_MISMATCH"
  | "MEDIA_TYPE_NOT_ALLOWED"
  | "SIZE_MISMATCH"
  | "SIZE_NOT_ALLOWED"
  | "HASH_MISMATCH"
  | "SCAN_REJECTED"
  | "SCAN_UNAVAILABLE"
  | "SCAN_INVALID"
  | "CONSENT_REQUIRED"
  | "CONSENT_REVOKED"
  | "CONSENT_EXPIRED"
  | "CONSENT_INVALID"
  | "RETENTION_INVALID"
  | "DOCUMENT_INACTIVE";

export type DevelopmentAttachmentDecision =
  | Readonly<{
      ok: true;
      disposition: "allowed";
      documentId: string;
      attachment: AttachmentReference;
      proof: DevelopmentAttachmentProof;
      provenance: Readonly<{
        algorithmVersion: "development-attachment-policy.v1";
        policyId: string;
        policyVersion: string;
        policySha256: Sha256Hex;
        retentionPolicyId: string;
        retentionPolicyVersion: string;
        retentionPolicySha256: Sha256Hex;
        scanEngineId: string;
        scanEngineVersion: string;
        scanSignatureVersion: string;
        scanReportSha256: Sha256Hex;
        consentVersion: string;
        consentRecordSha256: Sha256Hex;
        inputSha256: Sha256Hex;
      }>;
      decisionSha256: Sha256Hex;
    }>
  | Readonly<{
      ok: false;
      disposition: "denied";
      reasonCodes: readonly DevelopmentAttachmentDenyReason[];
    }>;

export type DevelopmentAttachmentEvaluationContext = Readonly<{
  cutoff: Date;
  revalidatedScope: AuthorizedChildScope | null;
  policy: DevelopmentAttachmentPolicy;
}>;

function digest(value: unknown): Sha256Hex {
  return createHash("sha256").update(new TextEncoder().encode(canonicalize(value))).digest("hex") as Sha256Hex;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function deny(...reasonCodes: DevelopmentAttachmentDenyReason[]): DevelopmentAttachmentDecision {
  return Object.freeze({ ok: false as const, disposition: "denied" as const, reasonCodes: Object.freeze(reasonCodes) });
}

function add(reasons: DevelopmentAttachmentDenyReason[], reason: DevelopmentAttachmentDenyReason): void {
  if (!reasons.includes(reason)) reasons.push(reason);
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

function scopeIsCurrent(request: AuthorizedChildScope, fresh: AuthorizedChildScope | null, cutoff: Date): fresh is AuthorizedChildScope {
  return fresh !== null
    && hasPermission(request, "record", cutoff)
    && hasPermission(request, "manage_documents", cutoff)
    && hasPermission(fresh, "record", cutoff)
    && hasPermission(fresh, "manage_documents", cutoff)
    && sameAuthorizedChildScope(request, fresh)
    && request.countryOfCare === fresh.countryOfCare
    && request.timezone === fresh.timezone
    && fresh.permissions.every((permission) => request.permissions.includes(permission));
}

function opaqueScopedPath(evidence: DevelopmentAttachmentEvidence, scope: AuthorizedChildScope): boolean {
  const parts = evidence.storage.objectPath.split("/");
  return parts.length === 4
    && parts[0] === scope.careSpaceId
    && parts[0] === evidence.careSpaceId
    && parts[1] === scope.childId
    && parts[1] === evidence.childId
    && parts[2] === evidence.documentId
    && /^[A-Za-z0-9_-]{16,128}$/u.test(parts[3] ?? "");
}

/** Trusted-only policy boundary; its result must not be exposed as a model-facing document API. */
export function evaluateDevelopmentAttachment(
  requestScope: AuthorizedChildScope,
  rawEvidence: DevelopmentAttachmentEvidence,
  context: DevelopmentAttachmentEvaluationContext,
): DevelopmentAttachmentDecision {
  try {
    const evidenceResult = evidenceSchema.safeParse(rawEvidence);
    if (!evidenceResult.success) return deny("INVALID_EVIDENCE");
    const cutoff = context.cutoff;
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime()) || !scopeIsCurrent(requestScope, context.revalidatedScope, cutoff)) {
      return deny("SCOPE_MISMATCH");
    }
    const policyResult = policySchema.safeParse(context.policy);
    if (!policyResult.success) return deny("POLICY_UNAVAILABLE");
    const evidence = evidenceResult.data;
    const policy = policyResult.data;
    const cutoffIso = cutoff.toISOString();
    const cutoffDate = localDate(cutoff, requestScope.timezone);
    if (cutoffDate === null) return deny("POLICY_UNAVAILABLE");
    if (!policy.current || policy.revoked || cutoffDate < policy.effectiveFrom
      || (policy.effectiveUntil !== null && cutoffDate > policy.effectiveUntil)) return deny("POLICY_UNAVAILABLE");

    const reasons: DevelopmentAttachmentDenyReason[] = [];
    if (evidence.careSpaceId !== requestScope.careSpaceId
      || evidence.childId !== requestScope.childId
      || evidence.uploadedBy !== requestScope.actorUserId) add(reasons, "SCOPE_MISMATCH");
    if (!opaqueScopedPath(evidence, requestScope)) add(reasons, "OBJECT_PATH_INVALID");
    if (evidence.storage.bucket !== "clinical-attachments"
      || evidence.storage.visibility !== "private"
      || evidence.storage.permanentUrl !== null) add(reasons, "PUBLIC_ACCESS_FORBIDDEN");
    if (evidence.purpose !== "development_observation" || evidence.ticket.purpose !== "development_observation") add(reasons, "PURPOSE_MISMATCH");

    const issuedAt = new Date(evidence.ticket.issuedAt).toISOString();
    const expiresAt = new Date(evidence.ticket.expiresAt).toISOString();
    const consumedAt = evidence.ticket.consumedAt === null ? null : new Date(evidence.ticket.consumedAt).toISOString();
    if (evidence.ticket.audience !== "private_upload"
      || evidence.ticket.state !== "consumed"
      || evidence.ticket.upsert
      || consumedAt === null
      || issuedAt > consumedAt
      || consumedAt > expiresAt
      || consumedAt > cutoffIso) add(reasons, "TICKET_INVALID");
    if (cutoffIso >= expiresAt) add(reasons, "TICKET_EXPIRED");

    if (evidence.content.declaredMediaType !== evidence.content.detectedMediaType) add(reasons, "MEDIA_TYPE_MISMATCH");
    if (!policy.allowedMediaTypes.includes(evidence.content.detectedMediaType)) add(reasons, "MEDIA_TYPE_NOT_ALLOWED");
    if (evidence.content.expectedSizeBytes !== evidence.content.actualSizeBytes) add(reasons, "SIZE_MISMATCH");
    if (evidence.content.actualSizeBytes === 0 || evidence.content.actualSizeBytes > policy.maximumSizeBytes) add(reasons, "SIZE_NOT_ALLOWED");
    if (evidence.content.expectedSha256 !== evidence.content.actualSha256) add(reasons, "HASH_MISMATCH");

    const scannedAt = new Date(evidence.scan.scannedAt).toISOString();
    if (evidence.scan.state === "rejected") add(reasons, "SCAN_REJECTED");
    if (evidence.scan.state === "unavailable" || !["clean", "extracted"].includes(evidence.processingState)) add(reasons, "SCAN_UNAVAILABLE");
    if (scannedAt > cutoffIso || (consumedAt !== null && scannedAt < consumedAt)) add(reasons, "SCAN_INVALID");

    const decisionAt = new Date(evidence.consent.decisionAt).toISOString();
    if (evidence.consent.status === "missing") add(reasons, "CONSENT_REQUIRED");
    if (evidence.consent.status === "revoked" || evidence.consent.revokedAt !== null) add(reasons, "CONSENT_REVOKED");
    if (evidence.consent.expiresAt !== null && cutoffIso >= new Date(evidence.consent.expiresAt).toISOString()) add(reasons, "CONSENT_EXPIRED");
    if (decisionAt > cutoffIso) add(reasons, "CONSENT_INVALID");
    if (!policy.allowedRetentionClasses.includes(evidence.retention.class)
      || evidence.retention.retainUntil < cutoffDate
      || !evidence.retention.current
      || evidence.retention.revoked
      || cutoffDate < evidence.retention.effectiveFrom
      || (evidence.retention.effectiveUntil !== null && cutoffDate > evidence.retention.effectiveUntil)) add(reasons, "RETENTION_INVALID");
    if (evidence.lifecycle.state !== "active" || evidence.lifecycle.deletedAt !== null) add(reasons, "DOCUMENT_INACTIVE");
    if (reasons.length > 0) return deny(...reasons);

    const attachmentState = evidence.processingState === "extracted" ? "extracted" as const : "clean" as const;
    const attachment: AttachmentReference = Object.freeze({
      bucket: "clinical-attachments",
      objectPath: evidence.storage.objectPath,
      digest: evidence.content.actualSha256 as Sha256Hex,
      mime: evidence.content.detectedMediaType,
      size: evidence.content.actualSizeBytes,
      state: attachmentState,
    });
    const authorizationProofSha256 = digest({
      schemaVersion: "development-attachment-authorization.v1",
      actorUserId: requestScope.actorUserId,
      careSpaceId: requestScope.careSpaceId,
      childId: requestScope.childId,
      authorizationVersion: requestScope.authorizationVersion,
      documentId: evidence.documentId,
      ticketScopeProofSha256: evidence.ticket.scopeProofSha256,
      contentSha256: evidence.content.actualSha256,
    });
    const proof: DevelopmentAttachmentProof = Object.freeze({
      bucket: "clinical-attachments",
      objectPath: evidence.storage.objectPath,
      contentDigest: evidence.content.actualSha256,
      mime: evidence.content.detectedMediaType,
      size: evidence.content.actualSizeBytes,
      state: attachmentState,
      status: "authorized_private",
      current: true,
      revoked: false,
      authorizationProofSha256,
      scopeProofSha256: evidence.ticket.scopeProofSha256,
    }) as DevelopmentAttachmentProof;
    const inputSha256 = digest({ evidence, policy, cutoff: cutoffIso });
    const provenance = Object.freeze({
      algorithmVersion: "development-attachment-policy.v1" as const,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      policySha256: policy.artifactSha256 as Sha256Hex,
      retentionPolicyId: evidence.retention.policyId,
      retentionPolicyVersion: evidence.retention.policyVersion,
      retentionPolicySha256: evidence.retention.policySha256 as Sha256Hex,
      scanEngineId: evidence.scan.engineId,
      scanEngineVersion: evidence.scan.engineVersion,
      scanSignatureVersion: evidence.scan.signatureVersion,
      scanReportSha256: evidence.scan.reportSha256 as Sha256Hex,
      consentVersion: evidence.consent.version,
      consentRecordSha256: evidence.consent.recordSha256 as Sha256Hex,
      inputSha256,
    });
    const decisionSha256 = digest({ disposition: "allowed", documentId: evidence.documentId, attachment, proof, provenance });
    return deepFreeze({ ok: true as const, disposition: "allowed" as const, documentId: evidence.documentId, attachment, proof, provenance, decisionSha256 });
  } catch {
    return deny("INVALID_EVIDENCE");
  }
}
