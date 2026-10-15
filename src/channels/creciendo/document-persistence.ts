import { createHash, createHmac, randomUUID } from "node:crypto";

import { canonicalize } from "json-canonicalize";

import type { PrivilegedJobScope } from "../../../agent/lib/supabase/privileged-job-scope";
import { withPrivilegedJobClient } from "../../../agent/lib/supabase/privileged-job-client";
import { createRequestSupabaseClient } from "../../../agent/lib/supabase/request-client";
import type { RuntimeConfig } from "../../../agent/lib/config/env";
import { evaluateUploadMetadata, DEFAULT_DOCUMENT_UPLOAD_POLICY } from "../../clinical/documents/upload-policy";
import { downloadTicketSchema, extractionDraftSchema, uploadTicketSchema, type ExtractionDraft, type UploadTicket, type DownloadTicket } from "../../clinical/documents/types";
import type { AuthorizedChildScope } from "../../../agent/lib/access/authorized-child-scope";
import type { AuthenticatedChannelRequest } from "./auth-middleware";
import type { DocumentPersistence } from "./routes/documents";
import type { DocumentListItem, UploadTicketRequest, DownloadTicketRequest } from "./document-contract";

type SupabaseResult = Readonly<{ data: unknown; error: Readonly<{ message?: string }> | null }>;
type SupabaseQuery = PromiseLike<SupabaseResult> & {
  select(columns?: string, options?: Record<string, unknown>): SupabaseQuery;
  eq(column: string, value: unknown): SupabaseQuery;
  is(column: string, value: unknown): SupabaseQuery;
  in(column: string, values: readonly unknown[]): SupabaseQuery;
  order(column: string, options?: Readonly<{ ascending?: boolean }>): SupabaseQuery;
  limit(value: number): SupabaseQuery;
  insert(values: unknown): SupabaseQuery;
  update(values: unknown): SupabaseQuery;
  maybeSingle(): Promise<SupabaseResult>;
};
type DynamicSupabaseClient = Readonly<{
  from(table: string): SupabaseQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<SupabaseResult>;
  storage: Readonly<{ from(bucket: string): Readonly<{
    createSignedUrl(path: string, expiresIn: number, options?: Readonly<{ download?: string }>): Promise<Readonly<{ data: Readonly<{ signedUrl: string }> | null; error: unknown | null }>>;
    upload(path: string, body: unknown, options: Readonly<{ contentType: string; upsert: false }>): Promise<Readonly<{ data: unknown; error: unknown | null }>>;
    remove(paths: readonly string[]): Promise<Readonly<{ data: unknown; error: unknown | null }>>;
  }> }>;
}>;

const MAX_DOCUMENT_SIZE = 52_428_800;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function dynamic(value: unknown): DynamicSupabaseClient { return value as DynamicSupabaseClient; }
function hash(value: unknown): string { return createHash("sha256").update(canonicalize(value), "utf8").digest("hex"); }
function ticketToken(config: RuntimeConfig, scope: AuthorizedChildScope, input: UploadTicketRequest): string {
  if (!config.childContextSigningKey) throw new Error("DOCUMENT_TICKET_SECRET_UNAVAILABLE");
  return createHmac("sha256", config.childContextSigningKey)
    .update(`creciendo.document-upload.v1\n${scope.actorUserId}\n${scope.careSpaceId}\n${scope.childId}\n${input.idempotencyKey}\n${hash(input)}`, "utf8")
    .digest("base64url");
}
function ticketHash(token: string): string { return createHash("sha256").update(token, "utf8").digest("hex"); }
function nonceHash(): string { return hash({ schemaVersion: "creciendo.document-ticket-nonce.v1", nonce: randomUUID() }); }
function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function nowIso(now: Date): string { return now.toISOString(); }
function uploadExpiry(now: Date, reservationExpiresAt: string): string {
  const expiry = Math.min(now.getTime() + 300_000, Date.parse(reservationExpiresAt));
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) throw new Error("DOCUMENT_TICKET_EXPIRY_INVALID");
  return new Date(expiry).toISOString();
}
function publicUrl(baseUrl: string, token: string): string {
  const origin = new URL(baseUrl);
  const localDevelopment = origin.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "10.0.2.2"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !localDevelopment) throw new Error("DOCUMENT_PUBLIC_URL_INVALID");
  return new URL("/creciendo/v1/documents/upload", origin).toString();
}
function uploadPolicyInput(input: UploadTicketRequest, current: Date) {
  const decision = evaluateUploadMetadata(input, DEFAULT_DOCUMENT_UPLOAD_POLICY, current);
  return decision.ok ? decision.metadata : null;
}
function rows(data: unknown): Array<Record<string, unknown>> {
  return Array.isArray(data) ? data.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)) : [];
}
function first(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return typeof data[0] === "object" && data[0] !== null ? data[0] as Record<string, unknown> : null;
  return typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
}
function statusPair(row: Record<string, unknown>): { lifecycle: DocumentListItem["lifecycle"]; scanState: DocumentListItem["scanState"] } {
  const storage = row.storage_status;
  if (storage === "reserved") return { lifecycle: "reserved", scanState: "pending" };
  if (storage === "uploaded") return { lifecycle: "uploaded", scanState: "pending" };
  if (storage === "processing") return { lifecycle: "processing", scanState: "pending" };
  if (storage === "quarantined") return { lifecycle: "quarantined", scanState: "infected" };
  if (storage === "failed") return { lifecycle: "failed", scanState: "failed" };
  if (storage === "deleted") return { lifecycle: "deleted", scanState: "failed" };
  return { lifecycle: "active", scanState: "clean" };
}
function listItem(row: Record<string, unknown>): DocumentListItem | null {
  if (typeof row.id !== "string" || !UUID.test(row.id) || typeof row.purpose !== "string" || typeof row.declared_mime_type !== "string"
    || typeof row.expected_size_bytes !== "number" || typeof row.expected_sha256 !== "string" || typeof row.created_at !== "string" || typeof row.updated_at !== "string") return null;
  const state = statusPair(row);
  const item = {
    id: row.id,
    purpose: row.purpose,
    displayName: typeof row.original_filename === "string" && row.original_filename.trim() ? row.original_filename : "Documento",
    declaredMimeType: row.declared_mime_type,
    detectedMimeType: typeof row.detected_mime_type === "string" ? row.detected_mime_type : null,
    sizeBytes: row.size_bytes ?? row.expected_size_bytes,
    sha256: row.sha256 ?? row.expected_sha256,
    lifecycle: state.lifecycle,
    scanState: state.scanState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
  };
  try { return Object.freeze(item) as DocumentListItem; } catch { return null; }
}

function privilegedScope(scope: AuthorizedChildScope, invocationId: string, now: Date): PrivilegedJobScope {
  return {
    jobName: "creciendo-document-transfer",
    invocationId,
    careSpaceId: scope.careSpaceId,
    childId: scope.childId,
    allowedOperations: ["channel:document-transfer"],
    issuedAt: new Date(now.getTime() - 1),
    expiresAt: new Date(Math.min(scope.expiresAt.getTime(), now.getTime() + 300_000)),
  } as unknown as PrivilegedJobScope;
}

export function createSupabaseDocumentPersistence(input: Readonly<{ config: RuntimeConfig; auth: AuthenticatedChannelRequest; baseUrl: string; now?: () => Date }>): DocumentPersistence {
  const client = dynamic(createRequestSupabaseClient({ config: input.config, accessToken: input.auth.guardian.bearerToken }));
  const now = input.now ?? (() => new Date());
  return Object.freeze({
    async list(scope, _cursor) {
      const result = await client.from("documents").select("id, purpose, original_filename, declared_mime_type, detected_mime_type, expected_size_bytes, size_bytes, expected_sha256, sha256, storage_status, created_at, updated_at, deleted_at").eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
      if (result.error) return null;
      return { documents: rows(result.data).map(listItem).filter((item): item is DocumentListItem => item !== null), nextCursor: null };
    },
    async uploadTicket(scope, request) {
      const current = now();
      const metadata = uploadPolicyInput(request, current);
      if (!metadata || !Number.isFinite(current.getTime())) return { ok: false as const, status: "unavailable" as const, code: "INVALID_INPUT" };
      const requestSha256 = hash({ schemaVersion: "creciendo.documents.v1", scope: { careSpaceId: scope.careSpaceId, childId: scope.childId }, request });
      const reservationResult = await client.rpc("reserve_creciendo_document_object", {
        p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_authorization_version: scope.authorizationVersion,
        p_purpose: metadata.purpose, p_display_name: metadata.displayName, p_declared_mime_type: metadata.mimeType,
        p_expected_size_bytes: metadata.sizeBytes, p_expected_sha256: metadata.sha256, p_retention_class: metadata.retentionClass,
        p_idempotency_key: request.idempotencyKey, p_request_sha256: requestSha256,
      });
      if (reservationResult.error) return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      const reservation = first(reservationResult.data);
      if (!reservation || reservation.outcome === "conflict" || reservation.outcome === "invalid") return { ok: false as const, status: "unavailable" as const, code: reservation?.outcome === "conflict" ? "IDEMPOTENCY_CONFLICT" : "INVALID_INPUT" };
      if (typeof reservation.document_id !== "string" || typeof reservation.object_path !== "string" || typeof reservation.reservation_expires_at !== "string") return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      const token = ticketToken(input.config, scope, request);
      const tokenSha = ticketHash(token);
      const expiry = uploadExpiry(current, reservation.reservation_expires_at);
      const nonce = nonceHash();
      const registered = await client.rpc("register_creciendo_document_transfer_ticket", { p_kind: "upload", p_document_id: reservation.document_id, p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_token_sha256: tokenSha, p_nonce_sha256: nonce, p_expires_at: expiry, p_expected_size_bytes: metadata.sizeBytes, p_expected_mime_type: metadata.mimeType, p_expected_sha256: metadata.sha256, p_idempotency_key: request.idempotencyKey });
      const registeredRow = first(registered.data);
      if (registered.error || !registeredRow || !["created", "replay"].includes(String(registeredRow.outcome)) || typeof registeredRow.ticket_id !== "string" || typeof registeredRow.nonce_sha256 !== "string") return { ok: false as const, status: "unavailable" as const, code: registeredRow?.outcome === "conflict" ? "IDEMPOTENCY_CONFLICT" : "PROVIDER_UNAVAILABLE" };
      const id = registeredRow.ticket_id;
      const registeredNonce = registeredRow.nonce_sha256;
      const ticket = uploadTicketSchema.parse({ kind: "upload", id, documentId: reservation.document_id, audience: "guardian", uploadUrl: publicUrl(input.baseUrl, token), requiredHeaders: { "content-type": metadata.mimeType, "x-upsert": "false", "x-content-sha256": metadata.sha256, "x-document-transfer-token": token }, sizeBytes: metadata.sizeBytes, mimeType: metadata.mimeType, sha256: metadata.sha256, issuedAt: nowIso(current), expiresAt: expiry, nonceSha256: registeredNonce }) as UploadTicket;
      return { ok: true as const, status: "issued" as const, ticket };
    },
    async downloadTicket(scope, request) {
      const result = await client.from("documents").select("id, bucket_id, object_path, original_filename, purpose, storage_status, processing_status, deleted_at").eq("id", request.documentId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).maybeSingle();
      const row = first(result.data);
      if (result.error || !row || row.storage_status !== "active" || !["clean", "extracted"].includes(String(row.processing_status)) || row.deleted_at !== null || typeof row.bucket_id !== "string" || typeof row.object_path !== "string" || typeof row.original_filename !== "string") return { ok: false as const, status: "unavailable" as const, code: "DOCUMENT_UNAVAILABLE" };
      const signed = await client.storage.from(row.bucket_id).createSignedUrl(row.object_path, 120, { download: row.original_filename });
      if (signed.error || !signed.data?.signedUrl) return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      const current = now();
      const expiry = new Date(current.getTime() + 120_000).toISOString();
      const id = deterministicUuid(`creciendo.document-download.v1\n${scope.actorUserId}\n${scope.careSpaceId}\n${scope.childId}\n${request.documentId}\n${request.idempotencyKey}`);
      const nonce = hash({ schemaVersion: "creciendo.document-ticket-nonce.v1", id });
      const ledger = await client.rpc("register_creciendo_document_transfer_ticket", { p_kind: "download", p_document_id: request.documentId, p_care_space_id: scope.careSpaceId, p_child_id: scope.childId, p_token_sha256: hash({ kind: "download", id, nonce }), p_nonce_sha256: nonce, p_expires_at: expiry, p_expected_size_bytes: null, p_expected_mime_type: null, p_expected_sha256: null, p_idempotency_key: request.idempotencyKey });
      const ledgerRow = first(ledger.data);
      if (ledger.error || !ledgerRow || !["created", "replay"].includes(String(ledgerRow.outcome))) return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      const ticket = downloadTicketSchema.parse({ kind: "download", id, documentId: request.documentId, audience: "guardian", downloadUrl: signed.data.signedUrl, displayName: row.original_filename, contentDisposition: "attachment", auditId: id, issuedAt: current.toISOString(), expiresAt: expiry, nonceSha256: nonce }) as DownloadTicket;
      return { ok: true as const, status: "issued" as const, ticket };
    },
    async ocrDraft(scope, documentId) {
      if (!UUID.test(documentId)) return null;
      const result = await client.from("documents").select("id, extraction_metadata, processing_status").eq("id", documentId).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).is("deleted_at", null).maybeSingle();
      const row = first(result.data);
      if (result.error || !row || !["extracted", "clean"].includes(String(row.processing_status))) return null;
      const metadata = row.extraction_metadata;
      const draft = extractionDraftSchema.safeParse(metadata).success ? extractionDraftSchema.parse(metadata) : typeof metadata === "object" && metadata !== null && "draft" in metadata ? extractionDraftSchema.safeParse((metadata as Record<string, unknown>).draft).data : null;
      return draft ? draft as unknown as ExtractionDraft : null;
    },
    async upload(scope, request) {
      const current = now();
      if (!Number.isFinite(current.getTime()) || request.contentLength < 1 || request.contentLength > MAX_DOCUMENT_SIZE || request.body.byteLength !== request.contentLength) return { ok: false as const, status: "unavailable" as const, code: "INVALID_INPUT" };
      const ticketResult = await client.rpc("get_creciendo_upload_ticket", { p_token_sha256: ticketHash(request.ticketId) });
      const ticket = first(ticketResult.data);
      if (ticketResult.error || !ticket || typeof ticket.expires_at !== "string" || ticket.care_space_id !== scope.careSpaceId || ticket.child_id !== scope.childId || ticket.expected_size_bytes !== request.contentLength || ticket.expected_mime_type !== request.contentType || ticket.expected_sha256 !== request.sha256) return { ok: false as const, status: "unavailable" as const, code: "TICKET_EXPIRED" };
      if (ticket.used_at !== null) return ["uploaded", "processing", "active"].includes(String(ticket.storage_status)) && typeof ticket.document_id === "string" ? { ok: true as const, documentId: ticket.document_id } : { ok: false as const, status: "unavailable" as const, code: "TICKET_EXPIRED" };
      if (Date.parse(ticket.expires_at) <= current.getTime()) return { ok: false as const, status: "unavailable" as const, code: "TICKET_EXPIRED" };
      const document = await client.from("documents").select("id, bucket_id, object_path").eq("id", ticket.document_id).eq("care_space_id", scope.careSpaceId).eq("child_id", scope.childId).eq("storage_status", "reserved").maybeSingle();
      const documentRow = first(document.data);
      if (document.error || !documentRow || typeof documentRow.bucket_id !== "string" || typeof documentRow.object_path !== "string") return { ok: false as const, status: "unavailable" as const, code: "DOCUMENT_UNAVAILABLE" };
      const pScope = privilegedScope(scope, String(ticket.ticket_id), current);
      const storage = await withPrivilegedJobClient({ config: input.config, scope: pScope, operation: "channel:document-transfer", now: current }, async (privileged) => {
        const result = await dynamic(privileged).storage.from(documentRow.bucket_id as string).upload(documentRow.object_path as string, request.body, { contentType: request.contentType, upsert: false });
        return result.error ? false : true;
      });
      if (!storage) return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      const finalized = await client.rpc("finalize_creciendo_document_upload", { p_token_sha256: ticketHash(request.ticketId), p_actual_size_bytes: request.contentLength, p_actual_sha256: request.sha256, p_detected_mime_type: request.contentType });
      const outcome = first(finalized.data);
      if (finalized.error || outcome?.outcome !== "uploaded") {
        await withPrivilegedJobClient({ config: input.config, scope: pScope, operation: "channel:document-transfer", now: current }, async (privileged) => { await dynamic(privileged).storage.from(documentRow.bucket_id as string).remove([documentRow.object_path as string]); return undefined; });
        return { ok: false as const, status: "unavailable" as const, code: "PROVIDER_UNAVAILABLE" };
      }
      return { ok: true as const, documentId: String(outcome.document_id) };
    },
  });
}
