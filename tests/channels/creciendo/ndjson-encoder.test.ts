import { describe, expect, it, vi } from "vitest";

import {
  MAX_NDJSON_FRAME_BYTES,
  NDJSON_CONTENT_TYPE,
  NdjsonEncoderError,
  createNdjsonStream,
  encodeNdjsonEvent,
} from "../../../src/channels/creciendo/ndjson-encoder";

const decoder = new TextDecoder();
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const TURN_ID = "20000000-0000-4000-8000-000000000002";
const CURSOR = "opaque-cursor-value-0000000000000001";

function event(sequence: number, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    version: "creciendo.channel-event.v1",
    eventId: `30000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`,
    sessionId: SESSION_ID,
    turnId: TURN_ID,
    sequence,
    occurredAt: "2026-08-24T16:00:00.000Z",
    cursor: `${CURSOR}:${sequence}`,
    type: "text-delta",
    terminal: false,
    data: { text: `fragment-${sequence}` },
    ...overrides,
  };
}

function terminal(sequence: number) {
  return event(sequence, {
    type: "message-complete",
    terminal: true,
    data: {
      messageId: "40000000-0000-4000-8000-000000000004",
      outcome: "completed",
      effectState: "none",
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) return chunks;
    chunks.push(next.value);
  }
}

describe("bounded Creciendo NDJSON encoder", () => {
  it("encodes one deterministic UTF-8 JSON object followed by exactly one LF", () => {
    const first = event(1, { data: { text: "Niña 👧🏽\nsegunda línea" } });
    const reordered = {
      data: first.data,
      terminal: first.terminal,
      type: first.type,
      cursor: first.cursor,
      occurredAt: first.occurredAt,
      sequence: first.sequence,
      turnId: first.turnId,
      sessionId: first.sessionId,
      eventId: first.eventId,
      version: first.version,
    };

    const encoded = encodeNdjsonEvent(first);
    const again = encodeNdjsonEvent(reordered);
    const line = decoder.decode(encoded);

    expect(NDJSON_CONTENT_TYPE).toBe("application/x-ndjson; charset=utf-8");
    expect(encoded).toEqual(again);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.slice(0, -1)).not.toContain("\n");
    expect(line.match(/\n/gu)).toHaveLength(1);
    expect(JSON.parse(line)).toEqual(first);
    expect(encoded.byteLength).toBeLessThanOrEqual(MAX_NDJSON_FRAME_BYTES);
  });

  it("rejects unknown fields, malformed/circular values, BigInt, controls, and oversized text without echo", () => {
    const circular = event(2) as Record<string, unknown>;
    circular.loop = circular;
    const attacks: readonly unknown[] = [
      { ...event(2), prompt: "hidden" },
      circular,
      { ...event(2), data: { text: BigInt(1) } },
      event(2, { data: { text: "bad\u0000text" } }),
      event(2, { data: { text: "x".repeat(4_097) } }),
    ];

    for (const attack of attacks) {
      expect(() => encodeNdjsonEvent(attack)).toThrowError(NdjsonEncoderError);
      try {
        encodeNdjsonEvent(attack);
      } catch (error) {
        expect(error).toMatchObject({ code: "NDJSON_EVENT_INVALID", message: "NDJSON_EVENT_INVALID" });
        expect(JSON.stringify(error)).not.toMatch(/hidden|bad|xxxxx/iu);
      }
    }
  });

  it("emits a heartbeat as a real event and never invents blank lines", async () => {
    const heartbeat = event(1, {
      type: "heartbeat",
      data: { observedAt: "2026-08-24T16:00:01.000Z" },
    });
    const [frame] = await readAll(createNdjsonStream([heartbeat, terminal(2)]));

    expect(frame).toBeDefined();
    const parsed = JSON.parse(decoder.decode(frame));
    expect(parsed).toMatchObject({ type: "heartbeat", terminal: false });
    expect(decoder.decode(frame)).not.toBe("\n");
  });

  it("preserves source order, emits one event per chunk, and closes immediately after terminal", async () => {
    const iteratorReturn = vi.fn(async () => ({ done: true as const, value: undefined }));
    let index = 0;
    const values = [event(1), event(2), terminal(3), event(4)];
    const source = {
      [Symbol.asyncIterator]() {
        return {
          next: vi.fn(async () => index < values.length
            ? { done: false as const, value: values[index++] }
            : { done: true as const, value: undefined }),
          return: iteratorReturn,
        };
      },
    };

    const frames = await readAll(createNdjsonStream(source));
    const parsed = frames.map((frame) => JSON.parse(decoder.decode(frame)));

    expect(parsed.map((item) => item.sequence)).toEqual([1, 2, 3]);
    expect(parsed.map((item) => item.type)).toEqual(["text-delta", "text-delta", "message-complete"]);
    expect(frames.every((frame) => decoder.decode(frame).match(/\n/gu)?.length === 1)).toBe(true);
    expect(iteratorReturn).toHaveBeenCalledTimes(1);
  });

  it("honors ReadableStream backpressure instead of pre-consuming the iterable", async () => {
    let nextCalls = 0;
    let releaseSecond!: () => void;
    const secondReady = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const source = {
      async *[Symbol.asyncIterator]() {
        nextCalls += 1;
        yield event(1);
        await secondReady;
        nextCalls += 1;
        yield terminal(2);
      },
    };
    const reader = createNdjsonStream(source).getReader();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(nextCalls).toBe(1);
    const first = await reader.read();
    expect(first.done).toBe(false);
    releaseSecond();
    const second = await reader.read();
    expect(second.done).toBe(false);
    expect(nextCalls).toBe(2);
    expect((await reader.read()).done).toBe(true);
  });

  it("never enqueues a partial bad frame and disposes the iterator on encoding failure", async () => {
    const iteratorReturn = vi.fn(async () => ({ done: true as const, value: undefined }));
    let index = 0;
    const values = [event(1), { ...event(2), rawToolResult: "secret-output" }];
    const source = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => index < values.length
            ? { done: false as const, value: values[index++] }
            : { done: true as const, value: undefined },
          return: iteratorReturn,
        };
      },
    };
    const reader = createNdjsonStream(source).getReader();
    const first = await reader.read();

    expect(decoder.decode(first.value)).toMatch(/^\{.*\}\n$/u);
    await expect(reader.read()).rejects.toMatchObject({
      code: "NDJSON_EVENT_INVALID",
      message: "NDJSON_EVENT_INVALID",
    });
    expect(iteratorReturn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on non-monotonic sequence before emitting the conflicting frame", async () => {
    const reader = createNdjsonStream([event(2), event(2)]).getReader();
    expect(JSON.parse(decoder.decode((await reader.read()).value)).sequence).toBe(2);
    await expect(reader.read()).rejects.toMatchObject({ code: "NDJSON_SEQUENCE_INVALID" });
  });

  it("cancels/aborts cooperatively without exposing reasons or consuming another event", async () => {
    const iteratorReturn = vi.fn(async () => ({ done: true as const, value: undefined }));
    let nextCalls = 0;
    const source = {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            nextCalls += 1;
            return { done: false as const, value: event(nextCalls) };
          },
          return: iteratorReturn,
        };
      },
    };
    const reader = createNdjsonStream(source).getReader();
    await reader.read();
    await reader.cancel("bearer secret must not propagate");
    const callsAtCancel = nextCalls;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(iteratorReturn).toHaveBeenCalledTimes(1);
    expect(nextCalls).toBe(callsAtCancel);

    const controller = new AbortController();
    controller.abort("private abort reason");
    const abortedReader = createNdjsonStream([event(1)], { signal: controller.signal }).getReader();
    await expect(abortedReader.read()).rejects.toMatchObject({
      code: "NDJSON_STREAM_ABORTED",
      message: "NDJSON_STREAM_ABORTED",
    });
  });
});
