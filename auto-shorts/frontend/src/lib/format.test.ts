import { describe, it, expect } from "vitest";
import { formatTimecode } from "./format";

describe("formatTimecode", () => {
  it("formats minutes and zero-padded seconds", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(9)).toBe("0:09");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
  });

  it("floors fractional seconds and clamps negatives", () => {
    expect(formatTimecode(12.9)).toBe("0:12");
    expect(formatTimecode(-5)).toBe("0:00");
  });
});
