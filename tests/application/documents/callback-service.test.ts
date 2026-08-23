import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createDocumentCallbackService, type DocumentCallbackRepository } from "../../../src/application/documents/callback-service.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const SECRET = "synthetic-test-secret";
const event = {
  providerEventId: "event-1", documentId: "00000000-0000-4000-8000-000000000001",
  eventType: "scan_completed", bucket: "vaccine-documents",
  objectPath: "space/child/document/v1", sizeBytes: 1024, mimeType: "application/pdf",
  sha256: "a".repeat(64), scanResult: "clean", occurredAt: "2026-08-23T11:59:30.000Z",
};

function signed(body: string, timestamp = "1787486400") {
  return `v1=${createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex")}`;
}

function repository(overrides: Partial<DocumentCallbackRepository> = {}): DocumentCallbackRepository {
  return {
    ingestVerified: vi.fn().mockResolvedValue({ outcome: "created", callbackId: "00000000-0000-4000-8000-000000000002" }),
    processVerified: vi.fn().mockResolvedValue({ outcome: "processed", documentStatus: "active" }),
    ...overrides,
  };
}

describe("DocumentCallbackService", () => {
  it("verifies exact raw bytes before parsing and stores only bounded verified fields", async () => {
    const raw = JSON.stringify(event);
    const callbacks = repository();
    const service = createDocumentCallbackService({ callbacks, resolveKey: vi.fn().mockResolvedValue(SECRET) }, { now: () => NOW });
    const result = await service.ingest("scanner", "scanner-v1", "1787486400", signed(raw), Buffer.from(raw));
    expect(result).toMatchObject({ ok: true, status: "verified" });
    expect(callbacks.ingestVerified).toHaveBeenCalledWith(expect.objectContaining({
      provider: "scanner", providerEventId: "event-1", rawBodySha256: expect.stringMatching(/^[a-f0-9]{64}$/), scanResult: "clean",
    }));
    expect(JSON.stringify((callbacks.ingestVerified as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(raw);
  });

  it.each([
    ["missing signature", "", "1787486400"],
    ["bad signature", "v1=deadbeef", "1787486400"],
    ["stale", "dynamic", "1787486000"],
    ["future", "dynamic", "1787486500"],
  ])("rejects %s before persistence", async (_label, signature, timestamp) => {
    const raw = JSON.stringify(event);
    const callbacks = repository();
    const actual = signature === "dynamic" ? signed(raw, timestamp) : signature;
    const result = await createDocumentCallbackService({ callbacks, resolveKey: vi.fn().mockResolvedValue(SECRET) }, { now: () => NOW })
      .ingest("scanner", "scanner-v1", timestamp, actual, Buffer.from(raw));
    expect(result).toEqual(expect.objectContaining({ ok: false }));
    expect(callbacks.ingestVerified).not.toHaveBeenCalled();
  });

  it("rejects malformed, mismatched, unknown-scan, and extra authority payloads", async () => {
    for (const value of [
      "not-json", JSON.stringify({ ...event, scanResult: "unknown" }),
      JSON.stringify({ ...event, childId: "00000000-0000-4000-8000-000000000099" }),
      JSON.stringify({ ...event, publicUrl: "https://example.invalid" }),
    ]) {
      const callbacks = repository();
      const result = await createDocumentCallbackService({ callbacks, resolveKey: vi.fn().mockResolvedValue(SECRET) }, { now: () => NOW })
        .ingest("scanner", "scanner-v1", "1787486400", signed(value), Buffer.from(value));
      expect(result).toEqual(expect.objectContaining({ ok: false }));
      expect(callbacks.ingestVerified).not.toHaveBeenCalled();
    }
  });

  it("deduplicates through the repository and processes only a verified ledger ID", async () => {
    const callbacks = repository({ ingestVerified: vi.fn().mockResolvedValue({ outcome: "idempotent_replay", callbackId: "00000000-0000-4000-8000-000000000002" }) });
    const service = createDocumentCallbackService({ callbacks, resolveKey: vi.fn().mockResolvedValue(SECRET) }, { now: () => NOW });
    const raw = JSON.stringify(event);
    expect(await service.ingest("scanner", "scanner-v1", "1787486400", signed(raw), Buffer.from(raw))).toMatchObject({ ok: true, outcome: "idempotent_replay" });
    expect(await service.process("00000000-0000-4000-8000-000000000002")).toEqual({ ok: true, status: "processed", documentStatus: "active" });
    expect(await service.process("not-an-id")).toEqual({ ok: false, status: "unavailable", code: "INVALID_INPUT" });
  });
});
