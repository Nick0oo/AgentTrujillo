import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { encodeNdjsonEvent } from "../../../src/channels/creciendo/ndjson-encoder";
import {
  CRECIENDO_CHANNEL_VERSION,
  CRECIENDO_EVENT_VERSION,
  parseChannelEvent,
  type ChannelEvent,
} from "../../../src/channels/creciendo/types";
import { WIDGET_REGISTRY } from "../../../src/presentation/widget-registry";

const FIXTURE_PATH = new URL("../../fixtures/channel/creciendo-v1.ndjson", import.meta.url);
const CONTRACT_PATH = new URL("../../../docs/contracts/creciendo-channel-v1.md", import.meta.url);

const ROUTES = Object.freeze([
  "POST /creciendo/v1/onboarding",
  "POST /creciendo/v1/child-context",
  "POST /creciendo/v1/sessions",
  "POST /creciendo/v1/sessions/{sessionId}/messages",
  "GET /creciendo/v1/sessions/{sessionId}/stream",
  "POST /creciendo/v1/sessions/{sessionId}/cancel",
]);

const EVENT_TYPES = Object.freeze([
  "text-delta",
  "tool-state",
  "ui-part",
  "citation",
  "heartbeat",
  "message-complete",
  "session-cancelled",
  "emergency-recommendation",
  "stream-error",
]);

const PRIVATE_KEYS = /(?:reasoning|prompt|instructions|raw(?:Input|Output|Arguments|Result|Tool|Provider)|providerFrame|serviceRole|bearerToken|childId|careSpaceId|ownerUserId)/iu;

async function loadFixture(): Promise<Readonly<{ lines: readonly string[]; events: readonly ChannelEvent[] }>> {
  const raw = await readFile(FIXTURE_PATH, "utf8");
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw).not.toContain("\r");
  const lines = raw.slice(0, -1).split("\n");
  expect(lines.every((line) => line.length > 0)).toBe(true);
  const events = lines.map((line) => parseChannelEvent(JSON.parse(line)));
  return { lines, events };
}

describe("Creciendo v1 mobile contract artifacts", () => {
  it("keeps every golden frame runtime-valid, canonical, bounded and terminal per synthetic stream", async () => {
    const { lines, events } = await loadFixture();
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(EVENT_TYPES));

    for (const [index, event] of events.entries()) {
      expect(event.version).toBe(CRECIENDO_EVENT_VERSION);
      expect(new TextDecoder().decode(encodeNdjsonEvent(event))).toBe(`${lines[index]}\n`);
      expect(new TextEncoder().encode(lines[index]).byteLength).toBeLessThanOrEqual(320 * 1_024);
      expect(lines[index]).not.toMatch(PRIVATE_KEYS);
    }

    const bySession = new Map<string, ChannelEvent[]>();
    for (const event of events) bySession.set(event.sessionId, [...(bySession.get(event.sessionId) ?? []), event]);
    for (const stream of bySession.values()) {
      expect(stream.map((event) => event.sequence)).toEqual(
        [...stream.map((event) => event.sequence)].sort((left, right) => left - right),
      );
      expect(new Set(stream.map((event) => event.sequence)).size).toBe(stream.length);
      const terminal = stream.findIndex((event) => event.terminal);
      if (terminal >= 0) expect(terminal).toBe(stream.length - 1);
    }
  });

  it("models confirmation, cancellation, safe error, retention guidance and one-event emergency termination", async () => {
    const { events } = await loadFixture();
    const confirmation = events.find((event) => event.type === "tool-state");
    expect(confirmation?.data.widget.data).toMatchObject({
      status: "awaiting_confirmation",
      effectState: "none",
      terminal: false,
      retry: { allowed: false, afterSeconds: null },
    });
    const cancelled = events.find((event) => event.type === "session-cancelled");
    expect(cancelled?.data).toEqual({ outcome: "effect_may_have_committed", effectState: "unknown" });
    const streamError = events.find((event) => event.type === "stream-error");
    expect(streamError?.data.error).toMatchObject({ code: "RETENTION_GAP", resumable: false });

    const emergency = events.find((event) => event.type === "emergency-recommendation");
    expect(emergency).toBeDefined();
    expect(events.filter((event) => event.sessionId === emergency!.sessionId)).toEqual([emergency]);
    const emergencyJson = JSON.stringify(emergency);
    expect(emergencyJson).not.toMatch(/action|button|url|phone|location|notification|appointment|handoff/iu);
  });

  it("publishes the exact six routes, closed widget versions and compatibility policy", async () => {
    const contract = await readFile(CONTRACT_PATH, "utf8");
    expect(contract).toContain(CRECIENDO_CHANNEL_VERSION);
    expect(contract).toContain(CRECIENDO_EVENT_VERSION);
    for (const route of ROUTES) expect(contract).toContain(route);
    for (const type of EVENT_TYPES) expect(contract).toContain(`\`${type}\``);
    for (const entry of Object.values(WIDGET_REGISTRY)) {
      expect(contract).toContain(`\`${entry.kind}\``);
      expect(contract).toContain(`\`${entry.version}\``);
    }
    expect(contract).toContain("RETENTION_GAP");
    expect(contract).toContain("Last-Event-ID");
    expect(contract).toContain("Idempotency-Key");
    expect(contract).toContain("X-Child-Context");
    expect(contract).not.toMatch(/(?:POST|GET|PUT|PATCH|DELETE) \/v1(?:\/|\b)/u);
    expect(contract).not.toMatch(/(?:POST|GET|PUT|PATCH|DELETE) \/eve\/v1/u);
    expect(contract).not.toMatch(/signed upload|upload URL|service.role/iu);
  });
});
