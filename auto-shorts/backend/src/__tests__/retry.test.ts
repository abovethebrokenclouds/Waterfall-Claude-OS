import { describe, it, expect } from "vitest";
import { withRetry, isRetryableModelError } from "../config/retry";

const noSleep = async () => {};

describe("withRetry", () => {
  it("returns immediately on first success", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "ok";
      },
      { sleep: noSleep },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 503 };
        return "recovered";
      },
      { sleep: noSleep, retries: 3 },
    );
    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("does not retry a non-retryable error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 400 };
        },
        { sleep: noSleep, isRetryable: isRetryableModelError },
      ),
    ).rejects.toEqual({ status: 400 });
    expect(calls).toBe(1);
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 500 };
        },
        { sleep: noSleep, retries: 2 },
      ),
    ).rejects.toEqual({ status: 500 });
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

describe("isRetryableModelError", () => {
  it("retries 429 and 5xx, not 4xx; retries network errors", () => {
    expect(isRetryableModelError({ status: 429 })).toBe(true);
    expect(isRetryableModelError({ status: 500 })).toBe(true);
    expect(isRetryableModelError({ status: 502 })).toBe(true);
    expect(isRetryableModelError({ status: 400 })).toBe(false);
    expect(isRetryableModelError({ status: 401 })).toBe(false);
    expect(isRetryableModelError(new Error("ECONNRESET"))).toBe(true);
  });
});
