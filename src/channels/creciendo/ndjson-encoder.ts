import {
  MAX_CHANNEL_EVENT_BYTES,
  parseChannelEvent,
  type ChannelEvent,
} from "./types";

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8" as const;
export const MAX_NDJSON_FRAME_BYTES = MAX_CHANNEL_EVENT_BYTES + 1;

export type NdjsonEncoderErrorCode =
  | "NDJSON_EVENT_INVALID"
  | "NDJSON_FRAME_TOO_LARGE"
  | "NDJSON_SEQUENCE_INVALID"
  | "NDJSON_STREAM_ABORTED"
  | "NDJSON_STREAM_FAILED";

export class NdjsonEncoderError extends Error {
  readonly code: NdjsonEncoderErrorCode;

  constructor(code: NdjsonEncoderErrorCode) {
    super(code);
    this.name = "NdjsonEncoderError";
    this.code = code;
  }
}

export type NdjsonStreamOptions = Readonly<{
  signal?: AbortSignal;
}>;

type EventSource = Iterable<unknown> | AsyncIterable<unknown>;
type EventIterator = Iterator<unknown> | AsyncIterator<unknown>;

const textEncoder = new TextEncoder();
const LF = "\n";

function encodeValidatedEvent(raw: unknown): Readonly<{
  event: ChannelEvent;
  frame: Uint8Array;
}> {
  let event: ChannelEvent;
  try {
    event = parseChannelEvent(raw);
  } catch {
    throw new NdjsonEncoderError("NDJSON_EVENT_INVALID");
  }

  let json: string;
  try {
    json = JSON.stringify(event);
  } catch {
    throw new NdjsonEncoderError("NDJSON_EVENT_INVALID");
  }
  const frame = textEncoder.encode(json + LF);
  if (frame.byteLength > MAX_NDJSON_FRAME_BYTES) {
    throw new NdjsonEncoderError("NDJSON_FRAME_TOO_LARGE");
  }
  return Object.freeze({ event, frame });
}

/** Returns one complete frame; callers never receive a partially encoded JSON value. */
export function encodeNdjsonEvent(raw: unknown): Uint8Array {
  return encodeValidatedEvent(raw).frame;
}

function eventIterator(source: EventSource): EventIterator {
  if (source !== null && typeof source === "object") {
    const asyncFactory = (source as AsyncIterable<unknown>)[Symbol.asyncIterator];
    if (typeof asyncFactory === "function") return asyncFactory.call(source);
    const syncFactory = (source as Iterable<unknown>)[Symbol.iterator];
    if (typeof syncFactory === "function") return syncFactory.call(source);
  }
  throw new NdjsonEncoderError("NDJSON_STREAM_FAILED");
}

function safeStreamError(error: unknown): NdjsonEncoderError {
  return error instanceof NdjsonEncoderError
    ? error
    : new NdjsonEncoderError("NDJSON_STREAM_FAILED");
}

/**
 * Pulls exactly one source event for each available stream slot. Cancellation/abort disposes the
 * iterator without forwarding an untrusted reason, and a terminal event closes the source.
 */
export function createNdjsonStream(
  source: EventSource,
  options: NdjsonStreamOptions = {},
): ReadableStream<Uint8Array> {
  const iterator = eventIterator(source);
  let stopped = false;
  let disposed = false;
  let lastSequence = 0;
  let abortListener: (() => void) | null = null;

  const markStopped = () => {
    if (stopped) return false;
    stopped = true;
    if (abortListener !== null) options.signal?.removeEventListener("abort", abortListener);
    return true;
  };

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    try {
      await iterator.return?.();
    } catch {
      // Disposal failures are intentionally not exposed or logged with their raw cause.
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      abortListener = () => {
        if (!markStopped()) return;
        controller.error(new NdjsonEncoderError("NDJSON_STREAM_ABORTED"));
        void dispose();
      };
      options.signal?.addEventListener("abort", abortListener, { once: true });
      if (options.signal?.aborted) abortListener();
    },

    async pull(controller) {
      if (stopped) return;
      try {
        const next = await iterator.next();
        if (stopped) return;
        if (next.done) {
          markStopped();
          controller.close();
          await dispose();
          return;
        }

        const encoded = encodeValidatedEvent(next.value);
        if (encoded.event.sequence <= lastSequence) {
          throw new NdjsonEncoderError("NDJSON_SEQUENCE_INVALID");
        }
        controller.enqueue(encoded.frame);
        lastSequence = encoded.event.sequence;

        if (encoded.event.terminal) {
          markStopped();
          controller.close();
          await dispose();
        }
      } catch (error) {
        if (!markStopped()) return;
        controller.error(safeStreamError(error));
        await dispose();
      }
    },

    async cancel() {
      markStopped();
      await dispose();
    },
  }, {
    highWaterMark: 1,
    size: () => 1,
  });
}
