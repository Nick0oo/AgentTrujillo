import { createHash } from "node:crypto";

import { canonicalize } from "json-canonicalize";
import { describe, expect, it } from "vitest";

import {
  projectAuditEvent,
  scanAuditSensitivity,
  type AuditEventEnvelope,
  type AuditEventProjectionState,
  type AuditEventProjectionTransaction,
} from "../../src/projections/audit-event-projection";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const SPACE = "00000000-0000-4000-8000-000000000002";
const CHILD = "00000000-0000-4000-8000-000000000003";
const SESSION = "00000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-08-29T12:00:00.000Z");

const scope = Object.freeze({ ownerUserId: ACTOR, careSpaceId: SPACE, childId: CHILD, productSessionId: SESSION });

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}

function event(overrides: Record<string, unknown> = {}) {
  const base = {
    type: "tool",
    action: "tool_execution_succeeded",
    actorType: "agent",
    actorDigest: "a".repeat(64),
    resourceType: "anthropometry_record",
    resourceId: "resource:00000000-0000-4000-8000-000000000010",
    requestDigest: "b".repeat(64),
    policyDigest: "c".repeat(64),
    outcome: "succeeded",
    retentionClass: "clinical_control",
    metadata: { policyCode: "TOOL_ALLOWED", attempt: 1 },
  };
  const value = { ...base, ...overrides };
  return Object.freeze({ ...value, eventDigest: digest(value) });
}

function envelope(overrides: Readonly<Record<string, unknown>> = {}): AuditEventEnvelope {
  const value = {
    scope,
    sourceEventId: "eve-audit-1",
    sourceEventVersion: "audit.v1",
    sourceSequence: 1,
    occurredAt: NOW.toISOString(),
    event: event(),
    ...overrides,
  };
  return value as AuditEventEnvelope;
}

class FakeTransaction implements AuditEventProjectionTransaction {
  state: AuditEventProjectionState | null = null;
  readonly processed = new Map<string, { sourceEventVersion: string; sourceSequence: number; eventDigest: string }>();
  readonly calls: string[] = [];
  readonly auditRows: unknown[] = [];
  readonly quarantined: unknown[] = [];

  now(): Date { return NOW; }

  async findProcessedSource(input: { scope: typeof scope; sourceEventId: string }) {
    this.calls.push(`source:${input.sourceEventId}`);
    return this.processed.get(input.sourceEventId) ?? null;
  }

  async appendAuditEvent(input: AuditEventProjectionState) {
    this.calls.push("audit");
    this.auditRows.push(input);
    this.state = input;
    return input;
  }

  async recordProcessedSource(input: { sourceEventId: string; sourceEventVersion: string; sourceSequence: number; eventDigest: string }) {
    this.calls.push("processed");
    this.processed.set(input.sourceEventId, input);
  }

  async quarantine(input: unknown) {
    this.calls.push("quarantine");
    this.quarantined.push(input);
  }
}

describe("privacy-safe immutable audit projection", () => {
  it("stores safe control evidence once and replays an identical source without appending", async () => {
    const tx = new FakeTransaction();
    const first = await projectAuditEvent(tx, envelope());
    const replay = await projectAuditEvent(tx, envelope());

    expect(first).toMatchObject({ disposition: "stored", outcome: "created" });
    expect(replay).toMatchObject({ disposition: "stored", outcome: "replayed" });
    expect(tx.auditRows).toHaveLength(1);
    expect(tx.calls).toEqual(["source:eve-audit-1", "audit", "processed", "source:eve-audit-1"]);
    expect(tx.auditRows[0]).toMatchObject({ scope, eventDigest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(Object.isFrozen(tx.auditRows[0])).toBe(true);
  });

  it("rejects a changed replay and never updates the immutable row", async () => {
    const tx = new FakeTransaction();
    await projectAuditEvent(tx, envelope());
    const result = await projectAuditEvent(tx, envelope({ event: event({ outcome: "failed" }) }));

    expect(result).toMatchObject({ disposition: "quarantined", reason: "source_conflict" });
    expect(tx.auditRows).toHaveLength(1);
    expect(tx.quarantined).toHaveLength(1);
  });

  it.each([
    ["nested PHI", { metadata: { patientName: "Ana", attempt: 1 } }],
    ["secret", { metadata: { accessToken: "Bearer secret-token" } }],
    ["raw URL", { metadata: { reference: "https://example.invalid/private" } }],
    ["raw prompt", { metadata: { prompt: "diagnose this child" } }],
  ])("quarantines %s before persistence", async (_label, metadata) => {
    const tx = new FakeTransaction();
    const result = await projectAuditEvent(tx, envelope({ event: event(metadata) }));

    expect(result).toMatchObject({ disposition: "quarantined", reason: "sensitive_payload" });
    expect(tx.auditRows).toHaveLength(0);
    expect(tx.calls).toEqual(["source:eve-audit-1", "quarantine"]);
  });

  it("exposes a deterministic sensitivity disposition and rejects extra fields", async () => {
    expect(scanAuditSensitivity({ metadata: { notes: "fever" } })).toMatchObject({ disposition: "sensitive" });
    const tx = new FakeTransaction();
    const result = await projectAuditEvent(tx, envelope({ event: { ...event(), rawResult: { value: 1 } } }));

    expect(result).toMatchObject({ disposition: "quarantined", reason: "invalid_event" });
    expect(tx.auditRows).toHaveLength(0);
  });

  it("rejects future clock drift without leaking payload contents", async () => {
    const tx = new FakeTransaction();
    const result = await projectAuditEvent(tx, envelope({ occurredAt: "2026-08-29T12:06:00.000Z" }));

    expect(result).toMatchObject({ disposition: "quarantined", reason: "timestamp_drift" });
    expect(tx.auditRows).toHaveLength(0);
  });
});
