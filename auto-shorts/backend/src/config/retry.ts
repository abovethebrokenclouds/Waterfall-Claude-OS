/**
 * Generic retry-with-exponential-backoff. Used by the Super Agent to ride out
 * transient model errors (429 / 5xx / network), but deliberately decoupled so it
 * is unit-testable with an injected sleep.
 */

export interface RetryOptions {
  /** Number of retries after the first attempt (total attempts = retries + 1). */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Return true if the error is worth retrying. Default: retry everything. */
  isRetryable?: (err: unknown) => boolean;
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const isRetryable = options.isRetryable ?? (() => true);
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || !isRetryable(err)) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
}

/** True for transient model/API failures worth retrying (429, 5xx, network). */
export function isRetryableModelError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") return status === 429 || status >= 500;
  return true; // no status => network/timeout/unknown: retry
}
