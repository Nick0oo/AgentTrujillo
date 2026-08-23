import { describe, expect, it, vi } from "vitest";

import { createAuthorizedChildScopeFromTrustedRow } from "../../../agent/lib/access/authorized-child-scope.ts";
import {
  createPrivateUploadTicketService,
  type DocumentReservationRepository,
  type PrivateUploadProvider,
} from "../../../src/application/documents/upload-ticket-service.ts";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const DOCUMENT = "00000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-08-23T12:00:00.000Z");
const URL = "https://example.supabase.co/storage/v1/object/upload/sign/private?token=opaque";
const DIGEST = "a".repeat(64);

const scope = createAuthorizedChildScopeFromTrustedRow({
  actorUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, permissions: ["read", "manage_documents"],
  countryOfCare: "CO", timezone: "America/Bogota", authorizationVersion: "m:1:a:1",
  issuedAt: new Date("2026-08-23T11:56:00.000Z"), expiresAt: new Date("2026-08-23T12:01:00.000Z"),
});

const input = {
  purpose: "vaccine_record" as const,
  fileName: "carnet.pdf",
  declaredMimeType: "application/pdf",
  sizeBytes: 1024,
  checksum: { algorithm: "sha256" as const, value: DIGEST },
  consent: { granted: true as const, purpose: "document_upload" as const },
  retentionClass: "child_record" as const,
  idempotencyKey: "upload-1",
};

function repository(overrides: Partial<DocumentReservationRepository> = {}): DocumentReservationRepository {
  return {
    reserve: vi.fn().mockResolvedValue({
      outcome: "created", documentId: DOCUMENT, bucket: "vaccine-documents",
      objectPath: `${SPACE}/${CHILD}/${DOCUMENT}/v1`, storageStatus: "reserved",
      reservationExpiresAt: "2026-08-23T12:05:00.000Z",
    }),
    recordIssuedTicket: vi.fn().mockResolvedValue("recorded"),
    cancel: vi.fn().mockResolvedValue("cancelled"),
    ...overrides,
  };
}

function provider(overrides: Partial<PrivateUploadProvider> = {}): PrivateUploadProvider {
  return {
    createSignedUpload: vi.fn().mockResolvedValue({ signedUrl: URL, expiresAt: "2026-08-23T12:05:00.000Z" }),
    ...overrides,
  };
}

describe("PrivateUploadTicketService", () => {
  it("reserves first and returns one five-minute no-upsert ticket for the exact object", async () => {
    const reservations = repository();
    const uploads = provider();
    const service = createPrivateUploadTicketService({
      authorize: vi.fn().mockResolvedValue(true), reservations, provider: uploads,
    }, { now: () => NOW, randomUUID: () => "00000000-0000-4000-8000-000000000005" });

    const result = await service.issue(scope, input);

    expect(result).toMatchObject({ ok: true, status: "issued", ticket: {
      kind: "upload", documentId: DOCUMENT, uploadUrl: URL, expiresAt: "2026-08-23T12:05:00.000Z",
      requiredHeaders: { "content-type": "application/pdf", "x-upsert": "false", "x-content-sha256": DIGEST },
    } });
    expect(reservations.reserve).toHaveBeenCalledBefore(uploads.createSignedUpload as ReturnType<typeof vi.fn>);
    expect(uploads.createSignedUpload).toHaveBeenCalledWith("vaccine-documents", `${SPACE}/${CHILD}/${DOCUMENT}/v1`, { upsert: false });
    expect(reservations.recordIssuedTicket).toHaveBeenCalledWith(scope, DOCUMENT, expect.objectContaining({
      ticketSha256: expect.stringMatching(/^[a-f0-9]{64}$/), expiresAt: "2026-08-23T12:05:00.000Z",
    }));
    expect(JSON.stringify((reservations.recordIssuedTicket as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(URL);
  });

  it("fails before reservation when current manage_documents access is revoked", async () => {
    const reservations = repository();
    const result = await createPrivateUploadTicketService({ authorize: vi.fn().mockResolvedValue(false), reservations, provider: provider() }, { now: () => NOW })
      .issue(scope, input);
    expect(result).toEqual({ ok: false, status: "unavailable", code: "NOT_AUTHORIZED" });
    expect(reservations.reserve).not.toHaveBeenCalled();
  });

  it("cancels the reservation on provider failure or an unsafe provider TTL", async () => {
    for (const uploadProvider of [
      provider({ createSignedUpload: vi.fn().mockRejectedValue(new Error("provider")) }),
      provider({ createSignedUpload: vi.fn().mockResolvedValue({ signedUrl: URL, expiresAt: "2026-08-23T14:00:00.000Z" }) }),
    ]) {
      const reservations = repository();
      const result = await createPrivateUploadTicketService({ authorize: vi.fn().mockResolvedValue(true), reservations, provider: uploadProvider }, { now: () => NOW })
        .issue(scope, input);
      expect(result).toEqual({ ok: false, status: "unavailable", code: "PROVIDER_UNAVAILABLE" });
      expect(reservations.cancel).toHaveBeenCalledWith(scope, DOCUMENT, "ticket_issue_failed");
    }
  });

  it("rejects caller scope, bucket, path, URL, or upsert authority", async () => {
    for (const injection of [
      { childId: CHILD }, { careSpaceId: SPACE }, { bucket: "vaccine-documents" },
      { objectPath: "chosen/path" }, { uploadUrl: URL }, { upsert: true },
    ]) {
      const result = await createPrivateUploadTicketService({ authorize: vi.fn().mockResolvedValue(true), reservations: repository(), provider: provider() }, { now: () => NOW })
        .issue(scope, { ...input, ...injection });
      expect(result).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
    }
  });

  it("fails closed on reservation conflict and on ticket-ledger races", async () => {
    const conflict = await createPrivateUploadTicketService({
      authorize: vi.fn().mockResolvedValue(true),
      reservations: repository({ reserve: vi.fn().mockResolvedValue({ outcome: "conflict" }) }), provider: provider(),
    }, { now: () => NOW }).issue(scope, input);
    expect(conflict).toEqual({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" });

    const reservations = repository({ recordIssuedTicket: vi.fn().mockResolvedValue("conflict") });
    const race = await createPrivateUploadTicketService({ authorize: vi.fn().mockResolvedValue(true), reservations, provider: provider() }, { now: () => NOW })
      .issue(scope, input);
    expect(race).toEqual({ ok: false, status: "unavailable", code: "IDEMPOTENCY_CONFLICT" });
    expect(reservations.cancel).toHaveBeenCalled();
  });

  it("does not mint a second URL for a reservation replay or accept a changed bucket", async () => {
    const baseReservation = {
      outcome: "created" as const, documentId: DOCUMENT, bucket: "vaccine-documents" as const,
      objectPath: `${SPACE}/${CHILD}/${DOCUMENT}/v1`, storageStatus: "reserved" as const,
      reservationExpiresAt: "2026-08-23T12:05:00.000Z",
    };
    for (const reservation of [
      { ...baseReservation, outcome: "idempotent_replay" as const },
      { ...baseReservation, bucket: "clinical-attachments" as const },
    ]) {
      const uploadProvider = provider();
      const result = await createPrivateUploadTicketService({
        authorize: vi.fn().mockResolvedValue(true),
        reservations: repository({ reserve: vi.fn().mockResolvedValue(reservation) }),
        provider: uploadProvider,
      }, { now: () => NOW }).issue(scope, input);
      expect(result).toEqual(expect.objectContaining({ ok: false }));
      expect(uploadProvider.createSignedUpload).not.toHaveBeenCalled();
    }
  });
});
