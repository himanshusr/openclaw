import { afterEach, describe, expect, it, vi } from "vitest";
import { computeBackoff, retry, sleepWithAbort } from "./backoff.js";

describe("retry adapter (#66)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const fastPolicy = { initialMs: 1, maxMs: 5, factor: 2, jitter: 0 };

  it("returns the value on the first success", async () => {
    const fn = vi.fn(async () => 42);
    const result = await retry(fn, fastPolicy);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries until the function succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error("transient");
      }
      return "ok";
    });
    const result = await retry(fn, fastPolicy);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("invokes onRetry between attempts with the computed delay", async () => {
    const onRetry = vi.fn();
    let calls = 0;
    await retry(
      async () => {
        calls += 1;
        if (calls < 2) {
          throw new Error("once");
        }
        return undefined;
      },
      { ...fastPolicy, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    const call = onRetry.mock.calls[0]?.[0];
    expect(call).toMatchObject({ attempt: 1, error: expect.any(Error) });
    expect(call.delayMs).toBeGreaterThanOrEqual(1);
  });

  it("throws the final error when maxAttempts is exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("never recovers");
    });
    await expect(retry(fn, { ...fastPolicy, maxAttempts: 3 })).rejects.toThrow("never recovers");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("aborts mid-sleep and surfaces 'aborted'", async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      throw new Error("kick");
    });
    const promise = retry(fn, {
      initialMs: 50,
      maxMs: 50,
      factor: 1,
      jitter: 0,
      abortSignal: controller.signal,
    });
    queueMicrotask(() => controller.abort());
    await expect(promise).rejects.toThrow("aborted");
  });

  it("does not call fn at all if the abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => "never");
    await expect(retry(fn, { ...fastPolicy, abortSignal: controller.signal })).rejects.toThrow(
      "aborted",
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it("preserves the existing computeBackoff + sleepWithAbort primitives", async () => {
    // Adapter must coexist with the legacy primitives so existing
    // consumers that have not yet been migrated keep working.
    expect(computeBackoff(fastPolicy, 1)).toBe(1);
    await expect(sleepWithAbort(0)).resolves.toBeUndefined();
  });
});
