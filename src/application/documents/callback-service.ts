import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

const UUID = z.string().uuid();
const DIGEST = z.string().regex(/^[a-f0-9]{64}$/u);
const INSTANT = z.string().datetime({ offset: true });
const EVENT = z.object({
  providerEventId: z.string().min(1).max(256),
  documentId: UUID,
  eventType: z.enum(["upload_completed", "scan_completed", "extraction_completed", "processing_failed"]),
  bucket: z.enum(["avatars", "vaccine-documents", "clinical-attachments", "generated-reports", "clinical-sources"]),
  objectPath: z.string().min(1).max(512).refine((value) => !value.startsWith("/") && !/(^|\/)\.\.?($|\/)/u.test(value)),
  sizeBytes: z.number().int().positive().max(52_428_800),
  mimeType: z.string().min(1).max(128),
  sha256: DIGEST,
  scanResult: z.enum(["pending", "clean", "infected", "failed"]),
  occurredAt: INSTANT,
}).strict();

export type VerifiedDocumentCallback = Readonly<z.infer<typeof EVENT> & {
  provider: string;
  signatureKeyId: string;
  rawBodySha256: string;
  receivedAt: string;
}>;

export interface DocumentCallbackRepository {
  ingestVerified(callback: VerifiedDocumentCallback): Promise<Readonly<{
    outcome: "created" | "idempotent_replay" | "conflict";
    callbackId?: string;
  }>>;
  processVerified(callbackId: string): Promise<Readonly<{
    outcome: "processed" | "idempotent_replay" | "rejected" | "conflict";
    documentStatus?: "uploaded" | "processing" | "active" | "quarantined" | "failed";
  }>>;
}

export type DocumentCallbackDependencies = Readonly<{
  callbacks: DocumentCallbackRepository;
  resolveKey(provider: string, keyId: string): Promise<string | null>;
}>;

export type DocumentCallbackFailureCode = "INVALID_SIGNATURE" | "STALE_EVENT" | "INVALID_INPUT" | "CALLBACK_CONFLICT" | "PROVIDER_UNAVAILABLE";
export type DocumentCallbackResult =
  | Readonly<{ ok: true; status: "verified"; outcome: "created" | "idempotent_replay"; callbackId: string }>
  | Readonly<{ ok: false; status: "unavailable"; code: DocumentCallbackFailureCode }>;
export type DocumentCallbackProcessResult =
  | Readonly<{ ok: true; status: "processed"; documentStatus: "uploaded" | "processing" | "active" | "quarantined" | "failed" }>
  | Readonly<{ ok: false; status: "unavailable"; code: "INVALID_INPUT" | "CALLBACK_CONFLICT" | "PROVIDER_UNAVAILABLE" }>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeSignature(actual: string, expected: string): boolean {
  if (!/^v1=[a-f0-9]{64}$/u.test(actual)) return false;
  const left = Buffer.from(actual.slice(3), "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class DocumentCallbackService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: DocumentCallbackDependencies, options: Readonly<{ now?: () => Date }> = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async ingest(
    provider: string,
    keyId: string,
    timestamp: string,
    signature: string,
    rawBody: Uint8Array,
  ): Promise<DocumentCallbackResult> {
    const current = this.readNow();
    if (!current || !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(provider) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyId)) {
      return this.failure("INVALID_INPUT");
    }
    if (!(rawBody instanceof Uint8Array) || rawBody.byteLength < 2 || rawBody.byteLength > 1_048_576 || !/^\d{10}$/u.test(timestamp)) {
      return this.failure("INVALID_INPUT");
    }
    const signedAt = Number(timestamp) * 1_000;
    if (!Number.isSafeInteger(signedAt) || signedAt < current.getTime() - 300_000 || signedAt > current.getTime() + 60_000) {
      return this.failure("STALE_EVENT");
    }
    let secret: string | null;
    try { secret = await this.dependencies.resolveKey(provider, keyId); } catch { return this.failure("PROVIDER_UNAVAILABLE"); }
    if (!secret || secret.length < 16) return this.failure("INVALID_SIGNATURE");
    const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
    if (!safeSignature(signature, expected)) return this.failure("INVALID_SIGNATURE");

    let value: unknown;
    try { value = JSON.parse(Buffer.from(rawBody).toString("utf8")); } catch { return this.failure("INVALID_INPUT"); }
    const event = EVENT.safeParse(value);
    if (!event.success) return this.failure("INVALID_INPUT");
    const occurredAt = Date.parse(event.data.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt > current.getTime() + 60_000 || occurredAt < current.getTime() - 24 * 60 * 60 * 1_000) {
      return this.failure("STALE_EVENT");
    }
    try {
      const stored = await this.dependencies.callbacks.ingestVerified(Object.freeze({
        ...event.data, provider, signatureKeyId: keyId, rawBodySha256: sha256(rawBody), receivedAt: current.toISOString(),
      }));
      if (stored.outcome === "conflict" || !stored.callbackId || !UUID.safeParse(stored.callbackId).success) return this.failure("CALLBACK_CONFLICT");
      return Object.freeze({ ok: true as const, status: "verified" as const, outcome: stored.outcome, callbackId: stored.callbackId });
    } catch {
      return this.failure("PROVIDER_UNAVAILABLE");
    }
  }

  async process(callbackId: string): Promise<DocumentCallbackProcessResult> {
    if (!UUID.safeParse(callbackId).success) return Object.freeze({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    try {
      const result = await this.dependencies.callbacks.processVerified(callbackId);
      if ((result.outcome !== "processed" && result.outcome !== "idempotent_replay") || !result.documentStatus) {
        return Object.freeze({ ok: false, status: "unavailable", code: "CALLBACK_CONFLICT" });
      }
      return Object.freeze({ ok: true, status: "processed", documentStatus: result.documentStatus });
    } catch {
      return Object.freeze({ ok: false, status: "unavailable", code: "PROVIDER_UNAVAILABLE" });
    }
  }

  private readNow(): Date | null {
    try {
      const value = this.now();
      return value instanceof Date && Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
    } catch { return null; }
  }

  private failure(code: DocumentCallbackFailureCode): DocumentCallbackResult {
    return Object.freeze({ ok: false as const, status: "unavailable" as const, code });
  }
}

export function createDocumentCallbackService(
  dependencies: DocumentCallbackDependencies,
  options: Readonly<{ now?: () => Date }> = {},
): DocumentCallbackService {
  return new DocumentCallbackService(dependencies, options);
}
