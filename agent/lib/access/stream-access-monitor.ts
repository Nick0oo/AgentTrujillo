import type { AccessDenied } from "./access-denied";
import type { AuthorizedChildScope } from "./authorized-child-scope";

export const STREAM_ACCESS_RECHECK_MS = 15_000;

export type StreamValidationResult = AuthorizedChildScope | AccessDenied;

export interface StreamAccessMonitor {
  monitor(input: Readonly<{
    validate: () => Promise<StreamValidationResult>;
    abort: AbortController;
    signal?: AbortSignal;
  }>): Promise<() => void>;
}

export interface StreamAccessScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realScheduler: StreamAccessScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createStreamAccessMonitor(
  scheduler: StreamAccessScheduler = realScheduler,
): StreamAccessMonitor {
  return {
    async monitor(input) {
      let closed = false;
      let checking = false;
      let timer: unknown;
      let abortListener: (() => void) | undefined;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (timer !== undefined) scheduler.clearTimeout(timer);
        if (abortListener && input.signal) input.signal.removeEventListener("abort", abortListener);
      };

      const deny = () => {
        if (closed) return;
        cleanup();
        if (!input.abort.signal.aborted) input.abort.abort();
      };

      const check = async () => {
        if (closed || checking || input.signal?.aborted || input.abort.signal.aborted) return;
        checking = true;
        try {
          const result = await input.validate();
          if ("ok" in result) deny();
        } catch {
          deny();
        } finally {
          checking = false;
          if (!closed && !input.signal?.aborted && !input.abort.signal.aborted) {
            timer = scheduler.setTimeout(() => void check(), STREAM_ACCESS_RECHECK_MS);
          }
        }
      };

      abortListener = () => cleanup();
      if (input.signal) {
        if (input.signal.aborted) {
          cleanup();
          return cleanup;
        }
        input.signal.addEventListener("abort", abortListener, { once: true });
      }
      if (input.abort.signal.aborted) {
        cleanup();
        return cleanup;
      }
      await check();
      return cleanup;
    },
  };
}
