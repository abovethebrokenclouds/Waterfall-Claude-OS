import { describe, it, expect } from "vitest";
import { encode, decode, osc, type OscArg } from "./osc";

describe("OSC codec", () => {
  it("round-trips an address with mixed args", () => {
    const args: OscArg[] = [
      osc.int(42),
      osc.float(0.5),
      osc.string("hello"),
    ];
    const buf = encode("/ch/01/mix/fader", args);
    const msg = decode(buf);
    expect(msg.address).toBe("/ch/01/mix/fader");
    expect(msg.args).toHaveLength(3);
    expect(msg.args[0]).toEqual({ type: "i", value: 42 });
    expect(msg.args[1].type).toBe("f");
    expect((msg.args[1] as { value: number }).value).toBeCloseTo(0.5, 6);
    expect(msg.args[2]).toEqual({ type: "s", value: "hello" });
  });

  it("encodes int32 big-endian", () => {
    const buf = encode("/a", [osc.int(1)]);
    const view = new DataView(buf);
    // "/a\0\0" = 4 bytes ; ",i\0\0" = 4 bytes ; then int32 = 1
    expect(view.getInt32(8, false)).toBe(1);
  });

  it("encodes float32 big-endian", () => {
    const buf = encode("/a", [osc.float(1.5)]);
    const view = new DataView(buf);
    expect(view.getFloat32(8, false)).toBeCloseTo(1.5, 6);
  });

  it("pads the address to a 4-byte boundary (null-terminated)", () => {
    // "/abc" is 4 chars; OSC needs a null + pad → 8 bytes
    const buf = encode("/abc", []);
    // address(8) + tag ","(1)->pad 4 = 12
    expect(buf.byteLength).toBe(12);
    const bytes = new Uint8Array(buf);
    expect(bytes[4]).toBe(0); // terminator
  });

  it("pads strings to 4-byte alignment", () => {
    // "ab" → "ab\0\0" = 4 bytes
    const buf = encode("/x", [osc.string("ab")]);
    // "/x\0\0"(4) + ",s\0\0"(4) + "ab\0\0"(4) = 12
    expect(buf.byteLength).toBe(12);
    expect(buf.byteLength % 4).toBe(0);
  });

  it("keeps total length a multiple of 4 for various inputs", () => {
    for (const s of ["", "a", "ab", "abc", "abcd", "abcde"]) {
      const buf = encode("/path/here", [osc.string(s), osc.int(7)]);
      expect(buf.byteLength % 4).toBe(0);
    }
  });

  it("round-trips a blob with correct length and padding", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const buf = encode("/blob", [osc.blob(data)]);
    expect(buf.byteLength % 4).toBe(0);
    const msg = decode(buf);
    expect(msg.args[0].type).toBe("b");
    expect(Array.from((msg.args[0] as { value: Uint8Array }).value)).toEqual([1, 2, 3, 4, 5]);
  });

  it("coerces raw JS values: integer→i, fractional→f, string→s", () => {
    const buf = encode("/mix", [3, 2.25, "go"]);
    const msg = decode(buf);
    expect(msg.args[0]).toEqual({ type: "i", value: 3 });
    expect(msg.args[1].type).toBe("f");
    expect(msg.args[2]).toEqual({ type: "s", value: "go" });
  });

  it("handles a message with no arguments", () => {
    const buf = encode("/ping");
    const msg = decode(buf);
    expect(msg.address).toBe("/ping");
    expect(msg.args).toHaveLength(0);
  });

  it("round-trips negative ints and floats", () => {
    const msg = decode(encode("/v", [osc.int(-7), osc.float(-12.5)]));
    expect((msg.args[0] as { value: number }).value).toBe(-7);
    expect((msg.args[1] as { value: number }).value).toBeCloseTo(-12.5, 6);
  });

  it("decodes from a Uint8Array view as well as an ArrayBuffer", () => {
    const buf = encode("/u", [osc.int(9)]);
    const view = new Uint8Array(buf);
    expect(decode(view).args[0]).toEqual({ type: "i", value: 9 });
  });
});
