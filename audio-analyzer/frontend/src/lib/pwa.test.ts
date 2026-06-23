import { describe, it, expect } from "vitest";
import { registerServiceWorker } from "./pwa";

describe("registerServiceWorker", () => {
  it("is a no-op and resolves false when window is undefined (SSR)", async () => {
    // In the vitest node environment there is no `window` by default.
    expect(typeof window).toBe("undefined");
    await expect(registerServiceWorker()).resolves.toBe(false);
  });

  it("does not throw", async () => {
    await expect(registerServiceWorker()).resolves.toBeTypeOf("boolean");
  });
});
