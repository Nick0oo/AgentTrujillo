import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { z } from "zod";

import {
  hasPermission,
  isAuthorizedChildScopeActive,
  type AuthorizedChildScope,
} from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  DEFAULT_DOCUMENT_UPLOAD_POLICY,
  evaluateUploadMetadata,
  type AcceptedUploadMetadata,
  type DocumentUploadPolicy,
} from "../../clinical/documents/upload-policy.ts";
import {
  uploadTicketSchema,
  type PrivateDocumentBucket,
  type UploadTicket,
} from "../../clinical/documents/types.ts";

const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const ISSUE_INPUT = z.object({
  purpose: z.enum(["avatar", "vaccine_record", "clinical_attachment", "generated_report", "clinical_source"]),
  fileName: z.string().min(1).max(512),
  declaredMimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int(),
  checksum: z.object({ algorithm: z.literal("sha256"), value: DIGEST }).strict(),
  consent: z.object({ granted: z.boolean(), purpose: z.literal("document_upload") }).strict(),
  retentionClass: z.enum(["ephemeral_upload", "child_record", "generated_artifact", "clinical_source"]),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u),
}).strict();

export type DocumentReservation = Readonly<{
  outcome: "created" | "idempotent_replay";
  documentId: string;
  bucket: PrivateDocumentBucket;
  objectPath: string;
  storageStatus: "reserved";
  reservationExpiresAt: string;
}>;

export type DocumentReservationResult = DocumentReservation | Readonly<{ outcome: "conflict" }>;

export interface DocumentReservationRepository {
  reserve(scope: AuthorizedChildScope, metadata: AcceptedUploadMetadata, idempotencyKey: string, requestSha256: string): Promise<DocumentReservationResult>;
  recordIssuedTicket(scope: AuthorizedChildScope, documentId: string, ticket: Readonly<{
    ticketId: string;
    ticketSha256: string;
    nonceSha256: string;
    expiresAt: string;
  }>): Promise<"recorded" | "idempotent_replay" | "conflict">;
  cancel(scope: AuthorizedChildScope, documentId: string, reason: "guardian_cancelled" | "ticket_issue_failed"): Promise<"cancelled" | "idempotent_replay" | "conflict">;
}

export interface PrivateUploadProvider {
  createSignedUpload(bucket: PrivateDocumentBucket, objectPath: string, options: Readonly<{ upsert: false }>): Promise<Readonly<{
    signedUrl: string;
    expiresAt: string;
  }>>;
}

export type PrivateUploadTicketDependencies = Readonly<{
  authorize(scope: AuthorizedChildScope): Promise<boolean>;
  reservations: DocumentReservationRepository;
  provider: PrivateUploadProvider;
  policy?: DocumentUploadPolicy | null;
}>;

export type PrivateUploadTicketFailureCode =
  | "NOT_AUTHORIZED"
  | "INVALID_INPUT"
  | "POLICY_UNAVAILABLE"
  | "IDEMPOTENCY_CONFLICT"
  | "PROVIDER_UNAVAILABLE";

export type PrivateUploadTicketResult =
  | Readonly<{ ok: true; status: "issued"; ticket: UploadTicket }>
  | Readonly<{ ok: false; status: "unavailable"; code: PrivateUploadTicketFailureCode }>;

export type PrivateUploadTicketServiceOptions = Readonly<{
  now?: () => Date;
  randomUUID?: () => string;
}>;

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function validNow(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validScope(scope: AuthorizedChildScope, now: Date): boolean {
  try {
    return Object.isFrozen(scope)
      && Object.isFrozen(scope.permissions)
      && isAuthorizedChildScopeActive(scope, now)
      && hasPermission(scope, "manage_documents", now);
  } catch {
    return false;
  }
}

function validProviderTicket(url: string, expiresAt: string, now: Date, reservationExpiresAt: string): boolean {
  try {
    const parsed = new URL(url);
    const expiry = Date.parse(expiresAt);
    return parsed.protocol === "https:"
      && Number.isFinite(expiry)
      && expiry > now.getTime()
      && expiry - now.getTime() <= 300_000
      && expiry <= Date.parse(reservationExpiresAt);
  } catch {
    return false;
  }
}

export class PrivateUploadTicketService {
  private readonly now: () => Date;
  private readonly randomUUID: () => string;
  private readonly policy: DocumentUploadPolicy | null;

  constructor(private readonly dependencies: PrivateUploadTicketDependencies, options: PrivateUploadTicketServiceOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.randomUUID = options.randomUUID ?? nodeRandomUUID;
    this.policy = dependencies.policy === undefined ? DEFAULT_DOCUMENT_UPLOAD_POLICY : dependencies.policy;
  }

  async issue(scope: AuthorizedChildScope, rawInput: unknown): Promise<PrivateUploadTicketResult> {
    const current = this.readNow();
    if (!current || !validScope(scope, current) || !(await this.currentlyAuthorized(scope))) return this.failure("NOT_AUTHORIZED");
    const parsed = ISSUE_INPUT.safeParse(rawInput);
    if (!parsed.success) return this.failure("INVALID_INPUT");
    const { idempotencyKey, ...uploadInput } = parsed.data;
    const decision = evaluateUploadMetadata(uploadInput, this.policy, current);
    if (!decision.ok) {
      return this.failure(decision.reasons.some((reason) => reason.startsWith("POLICY_")) ? "POLICY_UNAVAILABLE" : "INVALID_INPUT");
    }
    const requestSha256 = hash({ schemaVersion: "private-upload-reservation.v1", metadata: decision.metadata });
    let reservation: DocumentReservationResult;
    try {
      reservation = await this.dependencies.reservations.reserve(scope, decision.metadata, idempotencyKey, requestSha256);
    } catch {
      return this.failure("PROVIDER_UNAVAILABLE");
    }
    if (reservation.outcome === "conflict") return this.failure("IDEMPOTENCY_CONFLICT");
    if (reservation.outcome === "idempotent_replay") return this.failure("IDEMPOTENCY_CONFLICT");
    if (reservation.storageStatus !== "reserved"
      || reservation.bucket !== decision.metadata.bucket
      || !reservation.objectPath.startsWith(`${scope.careSpaceId}/${scope.childId}/${reservation.documentId}/`)
      || Date.parse(reservation.reservationExpiresAt) <= current.getTime()) {
      return this.failure("PROVIDER_UNAVAILABLE");
    }
    try {
      const providerTicket = await this.dependencies.provider.createSignedUpload(reservation.bucket, reservation.objectPath, { upsert: false });
      if (!validProviderTicket(providerTicket.signedUrl, providerTicket.expiresAt, current, reservation.reservationExpiresAt)) {
        await this.safeCancel(scope, reservation.documentId, "ticket_issue_failed");
        return this.failure("PROVIDER_UNAVAILABLE");
      }
      const ticketId = this.randomUUID();
      const nonceSha256 = hash({ schemaVersion: "private-upload-ticket-nonce.v1", nonce: this.randomUUID() });
      const ticketSha256 = hash({
        schemaVersion: "private-upload-ticket.v1", ticketId, documentId: reservation.documentId,
        nonceSha256, expiresAt: providerTicket.expiresAt, sizeBytes: decision.metadata.sizeBytes,
        mimeType: decision.metadata.mimeType, sha256: decision.metadata.sha256,
      });
      const recorded = await this.dependencies.reservations.recordIssuedTicket(scope, reservation.documentId, {
        ticketId, ticketSha256, nonceSha256, expiresAt: providerTicket.expiresAt,
      });
      if (recorded !== "recorded") {
        await this.safeCancel(scope, reservation.documentId, "ticket_issue_failed");
        return this.failure("IDEMPOTENCY_CONFLICT");
      }
      const ticket = uploadTicketSchema.parse({
        kind: "upload", id: ticketId, documentId: reservation.documentId, audience: "guardian",
        uploadUrl: providerTicket.signedUrl,
        requiredHeaders: {
          "content-type": decision.metadata.mimeType,
          "x-upsert": "false",
          "x-content-sha256": decision.metadata.sha256,
        },
        sizeBytes: decision.metadata.sizeBytes, mimeType: decision.metadata.mimeType,
        sha256: decision.metadata.sha256, issuedAt: current.toISOString(),
        expiresAt: providerTicket.expiresAt, nonceSha256,
      }) as UploadTicket;
      return Object.freeze({ ok: true as const, status: "issued" as const, ticket: Object.freeze(ticket) });
    } catch {
      await this.safeCancel(scope, reservation.documentId, "ticket_issue_failed");
      return this.failure("PROVIDER_UNAVAILABLE");
    }
  }

  async cancel(scope: AuthorizedChildScope, documentId: string): Promise<Readonly<{ ok: boolean; status: "cancelled" | "unavailable" }>> {
    const current = this.readNow();
    if (!current || !z.string().uuid().safeParse(documentId).success || !validScope(scope, current) || !(await this.currentlyAuthorized(scope))) {
      return Object.freeze({ ok: false, status: "unavailable" });
    }
    try {
      const result = await this.dependencies.reservations.cancel(scope, documentId, "guardian_cancelled");
      return result === "conflict"
        ? Object.freeze({ ok: false, status: "unavailable" })
        : Object.freeze({ ok: true, status: "cancelled" });
    } catch {
      return Object.freeze({ ok: false, status: "unavailable" });
    }
  }

  private readNow(): Date | null {
    try {
      const value = this.now();
      return validNow(value) ? new Date(value.getTime()) : null;
    } catch {
      return null;
    }
  }

  private async currentlyAuthorized(scope: AuthorizedChildScope): Promise<boolean> {
    try { return await this.dependencies.authorize(scope); } catch { return false; }
  }

  private async safeCancel(scope: AuthorizedChildScope, documentId: string, reason: "ticket_issue_failed"): Promise<void> {
    try { await this.dependencies.reservations.cancel(scope, documentId, reason); } catch { /* fail closed */ }
  }

  private failure(code: PrivateUploadTicketFailureCode): PrivateUploadTicketResult {
    return Object.freeze({ ok: false as const, status: "unavailable" as const, code });
  }
}

export function createPrivateUploadTicketService(
  dependencies: PrivateUploadTicketDependencies,
  options: PrivateUploadTicketServiceOptions = {},
): PrivateUploadTicketService {
  return new PrivateUploadTicketService(dependencies, options);
}
