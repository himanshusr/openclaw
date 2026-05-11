import type { BackoffPolicy } from "../infra/backoff.js";
import type { RuntimeEnv } from "../runtime.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { retry } from "../infra/backoff.js";
import { type SignalSseEvent, streamSignalEvents } from "./client.js";

const DEFAULT_RECONNECT_POLICY: BackoffPolicy = {
  initialMs: 1_000,
  maxMs: 10_000,
  factor: 2,
  jitter: 0.2,
};

type RunSignalSseLoopParams = {
  baseUrl: string;
  account?: string;
  abortSignal?: AbortSignal;
  runtime: RuntimeEnv;
  onEvent: (event: SignalSseEvent) => void;
  policy?: Partial<BackoffPolicy>;
};

// Sentinel thrown by the retry callback when the upstream stream ended
// cleanly (vs. errored out). The retry adapter treats both equally --
// always sleep + reconnect -- but we want to log them differently.
class SignalStreamEndedSentinel extends Error {
  constructor() {
    super("signal-sse-ended");
  }
}

// 630:P3 Issue #66 -- migrated to the retry() adapter from
// src/infra/backoff.js. Replaces the previous hand-rolled
// while-not-aborted loop + two try/catch blocks + four manual abort
// checks + manual computeBackoff/sleepWithAbort calls. Behavior is
// preserved; abort handling lives in the adapter.
export async function runSignalSseLoop({
  baseUrl,
  account,
  abortSignal,
  runtime,
  onEvent,
  policy,
}: RunSignalSseLoopParams) {
  const reconnectPolicy = {
    ...DEFAULT_RECONNECT_POLICY,
    ...policy,
  };

  try {
    await retry(
      async () => {
        await streamSignalEvents({
          baseUrl,
          account,
          abortSignal,
          onEvent,
        });
        // streamSignalEvents only returns when the upstream stream ends;
        // throwing the sentinel forces the adapter to sleep + reconnect.
        throw new SignalStreamEndedSentinel();
      },
      {
        ...reconnectPolicy,
        abortSignal,
        onRetry: ({ delayMs, error }) => {
          if (error instanceof SignalStreamEndedSentinel) {
            if (shouldLogVerbose()) {
              logVerbose(`Signal SSE stream ended, reconnecting in ${delayMs / 1000}s...`);
            }
            return;
          }
          runtime.error?.(`Signal SSE stream error: ${String(error)}`);
          runtime.log?.(`Signal SSE connection lost, reconnecting in ${delayMs / 1000}s...`);
        },
      },
    );
  } catch (err) {
    // The adapter throws "aborted" when the abort signal fires; that is
    // the normal exit path for this loop and not an error.
    if (abortSignal?.aborted) {
      return;
    }
    throw err;
  }
}
