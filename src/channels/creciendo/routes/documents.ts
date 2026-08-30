import type { RouteHandlerArgs } from "eve/channels";
import { createHash } from "node:crypto";

import type { AuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import type { ChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import type { AuthorizedChildScope, ChildPermission } from "../../../../agent/lib/access/authorized-child-scope";
import { createAuthorizeChildService } from "../../../../agent/lib/access/authorize-child-service";
import { createChildContextTokenService } from "../../../../agent/lib/access/child-context-token";
import type { RuntimeConfig } from "../../../../agent/lib/config/env";
import type { ExtractionDraft, UploadTicket, DownloadTicket } from "../../../clinical/documents/types";
import type { AuthenticatedChannelRequest } from "../auth-middleware";
import {
  DOCUMENT_LIST_RESPONSE_SCHEMA,
  DOCUMENTS_VERSION,
  DOWNLOAD_TICKET_REQUEST_SCHEMA,
  DOWNLOAD_TICKET_RESPONSE_SCHEMA,
  DOCUMENT_UPLOAD_RESPONSE_SCHEMA,
  OCR_DRAFT_RESPONSE_SCHEMA,
  UPLOAD_TICKET_REQUEST_SCHEMA,
  UPLOAD_TICKET_RESPONSE_SCHEMA,
  type DocumentListItem,
  type DownloadTicketRequest,
  type UploadTicketRequest,
} from "../document-contract";

export type DocumentScopeResolver = Readonly<{
  resolve(request: Request, auth: AuthenticatedChannelRequest, permission: ChildPermission): Promise<AuthorizedChildScope | null>;
}>;

export type DocumentPersistence = Readonly<{
  list(scope: AuthorizedChildScope, cursor: string | null): Promise<Readonly<{ documents: readonly DocumentListItem[]; nextCursor: string | null }> | null>;
  uploadTicket(scope: AuthorizedChildScope, input: UploadTicketRequest): Promise<Readonly<{ ok: true; status: "issued"; ticket: UploadTicket }> | Readonly<{ ok: false; status: "unavailable"; code: string }>>;
  downloadTicket(scope: AuthorizedChildScope, input: DownloadTicketRequest): Promise<Readonly<{ ok: true; status: "issued"; ticket: DownloadTicket }> | Readonly<{ ok: false; status: "unavailable"; code: string }>>;
  ocrDraft(scope: AuthorizedChildScope, documentId: string): Promise<ExtractionDraft | null>;
  upload(scope: AuthorizedChildScope, input: Readonly<{ ticketId: string; body: Uint8Array; contentType: string; contentLength: number; sha256: string }>): Promise<Readonly<{ ok: true; documentId: string }> | Readonly<{ ok: false; status: "unavailable"; code: string }>>;
}>;

export type DocumentRouteDependencies = Readonly<{
  scope: DocumentScopeResolver;
  documents: DocumentPersistence;
  now?: () => Date;
}>;

function errorResponse(status: 400 | 403 | 404 | 409 | 413 | 415 | 422 | 503, code: string): Response {
  return Response.json({
    version: "creciendo.error.v1",
    code,
    retryable: status === 503,
    retryAfterSeconds: null,
    effectState: "none",
    resumable: false,
  }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

async function readJson(request: Request): Promise<unknown | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  try { return await request.json(); } catch { return null; }
}

function mapFailure(code: string): Response {
  if (code === "NOT_AUTHORIZED") return errorResponse(403, code);
  if (code === "INVALID_INPUT") return errorResponse(400, code);
  if (code === "DOCUMENT_UNAVAILABLE") return errorResponse(404, code);
  if (code === "IDEMPOTENCY_CONFLICT") return errorResponse(409, code);
  if (code === "TICKET_EXPIRED") return errorResponse(422, code);
  return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
}

function cursor(request: Request): string | null {
  const value = new URL(request.url).searchParams.get("cursor");
  return value === null || (value.length > 0 && value.length <= 512) ? value : "__invalid__";
}

async function resolveDocumentScope(
  request: Request,
  auth: AuthenticatedChannelRequest,
  dependencies: DocumentRouteDependencies,
  permission: ChildPermission,
): Promise<AuthorizedChildScope | null> {
  const token = request.headers.get("x-child-context");
  if (!token || token.length > 4096) return null;
  try { return await dependencies.scope.resolve(request, auth, permission); } catch { return null; }
}

export async function handleDocumentList(request: Request, auth: AuthenticatedChannelRequest, dependencies: DocumentRouteDependencies): Promise<Response> {
  const selected = cursor(request);
  if (selected === "__invalid__") return errorResponse(400, "REQUEST_INVALID");
  const scope = await resolveDocumentScope(request, auth, dependencies, "read");
  if (!scope) return errorResponse(403, "NOT_AUTHORIZED");
  try {
    const result = await dependencies.documents.list(scope, selected);
    if (!result) return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
    const response = DOCUMENT_LIST_RESPONSE_SCHEMA.parse({ version: DOCUMENTS_VERSION, requestId: auth.requestId, ...result });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return errorResponse(413, "REQUEST_TOO_LARGE");
    return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
  }
}

export async function handleUploadTicket(request: Request, auth: AuthenticatedChannelRequest, dependencies: DocumentRouteDependencies): Promise<Response> {
  const raw = await readJson(request);
  if (raw === null) return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE");
  const parsed = UPLOAD_TICKET_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "INVALID_INPUT");
  if (request.headers.get("idempotency-key") !== parsed.data.idempotencyKey) return errorResponse(400, "INVALID_INPUT");
  const scope = await resolveDocumentScope(request, auth, dependencies, "manage_documents");
  if (!scope) return errorResponse(403, "NOT_AUTHORIZED");
  try {
    const result = await dependencies.documents.uploadTicket(scope, parsed.data);
    if (!result.ok) return mapFailure(result.code);
    const response = UPLOAD_TICKET_RESPONSE_SCHEMA.parse({ version: DOCUMENTS_VERSION, requestId: auth.requestId, ...result });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

export async function handleDownloadTicket(request: Request, auth: AuthenticatedChannelRequest, dependencies: DocumentRouteDependencies): Promise<Response> {
  const raw = await readJson(request);
  if (raw === null) return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE");
  const parsed = DOWNLOAD_TICKET_REQUEST_SCHEMA.safeParse(raw);
  if (!parsed.success) return errorResponse(400, "INVALID_INPUT");
  const scope = await resolveDocumentScope(request, auth, dependencies, "read");
  if (!scope) return errorResponse(403, "NOT_AUTHORIZED");
  try {
    const result = await dependencies.documents.downloadTicket(scope, parsed.data);
    if (!result.ok) return mapFailure(result.code);
    const response = DOWNLOAD_TICKET_RESPONSE_SCHEMA.parse({ version: DOCUMENTS_VERSION, requestId: auth.requestId, ...result });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

function documentIdFrom(request: Request, args?: RouteHandlerArgs): string | null {
  const candidate = args?.params.documentId ?? new URL(request.url).pathname.split("/").at(-2);
  return typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate) ? candidate : null;
}

export async function handleOcrDraft(request: Request, auth: AuthenticatedChannelRequest, dependencies: DocumentRouteDependencies, args?: RouteHandlerArgs): Promise<Response> {
  const documentId = documentIdFrom(request, args);
  if (!documentId) return errorResponse(400, "INVALID_INPUT");
  const scope = await resolveDocumentScope(request, auth, dependencies, "read");
  if (!scope) return errorResponse(403, "NOT_AUTHORIZED");
  try {
    const draft = await dependencies.documents.ocrDraft(scope, documentId);
    const response = OCR_DRAFT_RESPONSE_SCHEMA.parse({ version: DOCUMENTS_VERSION, requestId: auth.requestId, documentId, draft });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch { return errorResponse(503, "PERSISTENCE_UNAVAILABLE"); }
}

export async function handleDocumentUpload(request: Request, auth: AuthenticatedChannelRequest, dependencies: DocumentRouteDependencies): Promise<Response> {
  const ticketId = request.headers.get("x-document-transfer-token");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const declaredLength = request.headers.get("content-length");
  const expectedHash = request.headers.get("x-content-sha256");
  if (!ticketId || ticketId.length > 512 || !contentType || !declaredLength || !/^\d+$/u.test(declaredLength) || !expectedHash || !/^[a-f0-9]{64}$/u.test(expectedHash)) {
    return errorResponse(400, "INVALID_INPUT");
  }
  const contentLength = Number(declaredLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > 52_428_800) return errorResponse(413, "REQUEST_TOO_LARGE");
  const scope = await resolveDocumentScope(request, auth, dependencies, "manage_documents");
  if (!scope) return errorResponse(403, "NOT_AUTHORIZED");
  try {
    const body = await readBoundedBinary(request, 52_428_800);
    if (body.byteLength !== contentLength) return errorResponse(400, "INVALID_INPUT");
    const actualHash = createHash("sha256").update(body).digest("hex");
    if (actualHash !== expectedHash) return errorResponse(400, "INVALID_INPUT");
    const result = await dependencies.documents.upload(scope, { ticketId, body, contentType, contentLength, sha256: actualHash });
    if (!result.ok) return mapFailure(result.code);
    const response = DOCUMENT_UPLOAD_RESPONSE_SCHEMA.parse({ version: DOCUMENTS_VERSION, requestId: auth.requestId, ok: true, status: "uploaded", documentId: result.documentId });
    return Response.json(response, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") return errorResponse(413, "REQUEST_TOO_LARGE");
    return errorResponse(503, "PERSISTENCE_UNAVAILABLE");
  }
}

async function readBoundedBinary(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("REQUEST_TOO_LARGE");
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export function createDocumentScopeResolver(input: Readonly<{ tokens: ChildContextTokenService; authorizeChild: AuthorizeChildService; now?: () => Date }>): DocumentScopeResolver {
  return Object.freeze({
    async resolve(request, auth, permission) {
      const token = request.headers.get("x-child-context");
      const now = input.now?.() ?? new Date();
      if (!token || token.length > 4096 || !Number.isFinite(now.getTime())) return null;
      const claims = await input.tokens.verify(token, auth.guardian, now);
      if (!("childId" in claims)) return null;
      const scope = await input.authorizeChild.authorize({
        guardian: auth.guardian,
        requestedChildId: claims.childId,
        requiredPermissions: [permission],
        requestId: auth.requestId,
        now,
      });
      if (!("childId" in scope)
        || scope.actorUserId !== auth.guardian.userId
        || scope.careSpaceId !== claims.careSpaceId
        || scope.childId !== claims.childId
        || scope.authorizationVersion !== claims.authorizationVersion) return null;
      return scope;
    },
  });
}

export function createDocumentRouteDependencies(config: RuntimeConfig, documents: DocumentPersistence): DocumentRouteDependencies {
  return Object.freeze({
    scope: createDocumentScopeResolver({
      tokens: createChildContextTokenService(config),
      authorizeChild: createAuthorizeChildService(config),
    }),
    documents,
  });
}
