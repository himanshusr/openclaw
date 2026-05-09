import { setTimeout as delay } from "node:timers/promises";

export type BackoffPolicy = {
  initialMs: number;
  maxMs: number;
  factor: number;
  jitter: number;
};

export function computeBackoff(policy: BackoffPolicy, attempt: number) {
  const base = policy.initialMs * policy.factor ** Math.max(attempt - 1, 0);
  const jitter = base * policy.jitter * Math.random();
  return Math.min(policy.maxMs, Math.round(base + jitter));
}

export async function sleepWithAbort(ms: number, abortSignal?: AbortSignal) {
  if (ms <= 0) {
    return;
  }
  try {
    await delay(ms, undefined, { signal: abortSignal });
  } catch (err) {
    if (abortSignal?.aborted) {
      throw new Error("aborted", { cause: err });
    }
    throw err;
  }
}

// 630:P3 Issue #66 -- Retry Adapter.
//
// Four channel files (signal/sse-reconnect.ts, telegram/monitor.ts,
// web/reconnect.ts, web/auto-reply/monitor.ts) hand-roll the same
// attempt-counter / computeBackoff / sleepWithAbort / try-catch /
// max-attempt-cap loop, repeated 15-25 lines per consumer.
//
// Rather than pulling a third-party retry library, we ship a small in-
// repo Adapter that presents the same shape as a vetted retry API
// (single `await retry(fn, policy)` call, optional onRetry callback,
// abort propagation) on top of the existing primitives. Existing
// consumers keep working unchanged; new ones (and migrated old ones)
// drop the boilerplate.
//
// Per the issue's Non-goals we do not migrate every consumer in this
// PR -- this PR introduces the adapter and migrates one demo consumer
// (signal/sse-reconnect.ts).

export type RetryContext = {
  /** 1-based attempt counter (1 on the first call, 2 on the first retry). */
  attempt: number;
};

export type RetryPolicy = BackoffPolicy & {
  /**
   * Maximum number of attempts. Zero or undefined means retry forever
   * (until the abort signal fires). The first call counts as attempt 1.
   */
  maxAttempts?: number;
  /** AbortSignal observed both during fn() and between attempts. */
  abortSignal?: AbortSignal;
  /**
   * Invoked after a failed attempt and before sleeping. Useful for the
   * "reconnecting in Ns..." log line every existing consumer prints.
   */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
};

/**
 * Adapter over computeBackoff + sleepWithAbort. Runs `fn` until it
 * returns, the abort signal fires, or maxAttempts is reached.
 */
export async function retry<T>(
  fn: (ctx: RetryContext) => Promise<T>,
  policy: RetryPolicy,
): Promise<T> {
  const max = policy.maxAttempts ?? 0;
  let attempt = 0;
  // We loop forever; exits via return, throw, or abort. The intermediate
  // sleep step is the only place an abort can quietly cancel us, and
  // sleepWithAbort already throws "aborted" in that case.
  while (true) {
    if (policy.abortSignal?.aborted) {
      throw new Error("aborted");
    }
    attempt += 1;
    try {
      return await fn({ attempt });
    } catch (err) {
      if (policy.abortSignal?.aborted) {
        throw new Error("aborted", { cause: err });
      }
      if (max > 0 && attempt >= max) {
        throw err;
      }
      const delayMs = computeBackoff(policy, attempt);
      policy.onRetry?.({ attempt, delayMs, error: err });
      await sleepWithAbort(delayMs, policy.abortSignal);
    }
  }
}
