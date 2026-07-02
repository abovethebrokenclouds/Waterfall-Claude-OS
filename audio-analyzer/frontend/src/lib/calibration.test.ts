import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAL_OFFSET,
  MIN_OFFSET_DB,
  MAX_OFFSET_DB,
  clampOffset,
  keyForDevice,
  offsetFromReference,
  findCalibration,
  offsetForDevice,
  upsertCalibration,
  removeCalibration,
  calibrationsToJson,
  parseCalibrationsJson,
  type MicCalibration,
} from "./calibration";

const cal = (over: Partial<MicCalibration> = {}): MicCalibration => ({
  deviceId: "mic-1",
  offsetDb: 120,
  calibratedAt: 1000,
  ...over,
});

describe("clampOffset", () => {
  it("clamps to [MIN, MAX] and defaults non-finite", () => {
    expect(clampOffset(-10)).toBe(MIN_OFFSET_DB);
    expect(clampOffset(999)).toBe(MAX_OFFSET_DB);
    expect(clampOffset(120)).toBe(120);
    expect(clampOffset(NaN)).toBe(DEFAULT_CAL_OFFSET);
    // Infinity is not finite → defaults, it does NOT clamp to MAX.
    expect(clampOffset(Infinity)).toBe(DEFAULT_CAL_OFFSET);
  });
});

describe("keyForDevice", () => {
  it("collapses empty / null / undefined to 'default'", () => {
    expect(keyForDevice("")).toBe("default");
    expect(keyForDevice(null)).toBe("default");
    expect(keyForDevice(undefined)).toBe("default");
    expect(keyForDevice("abc")).toBe("abc");
  });
});

describe("offsetFromReference", () => {
  it("solves offset = referenceSpl - measuredDbfs", () => {
    // -40 dBFS measured against a 94 dB reference -> 134 dB offset.
    expect(offsetFromReference(-40, 94)).toBe(134);
  });
  it("clamps an implausible result", () => {
    expect(offsetFromReference(-200, 94)).toBe(MAX_OFFSET_DB); // 94+200=294 -> clamp high
    expect(offsetFromReference(100, 94)).toBe(MIN_OFFSET_DB); // 94-100=-6 -> clamp low
    expect(offsetFromReference(-50, 94)).toBe(144); // in range, no clamp
  });
  it("defaults on non-finite inputs", () => {
    expect(offsetFromReference(NaN, 94)).toBe(DEFAULT_CAL_OFFSET);
    expect(offsetFromReference(-40, Infinity)).toBe(DEFAULT_CAL_OFFSET);
  });
});

describe("upsert / find / offsetForDevice / remove", () => {
  it("adds, then replaces by device key (immutably)", () => {
    let list: MicCalibration[] = [];
    list = upsertCalibration(list, cal({ deviceId: "mic-1", offsetDb: 120 }));
    expect(list).toHaveLength(1);
    const snapshot = list;
    list = upsertCalibration(list, cal({ deviceId: "mic-1", offsetDb: 130 }));
    expect(list).toHaveLength(1);
    expect(list[0].offsetDb).toBe(130);
    expect(snapshot).toHaveLength(1); // original array untouched
    expect(snapshot[0].offsetDb).toBe(120);
  });
  it("normalizes empty deviceId to 'default' and clamps offset on upsert", () => {
    const list = upsertCalibration([], cal({ deviceId: "", offsetDb: 999 }));
    expect(list[0].deviceId).toBe("default");
    expect(list[0].offsetDb).toBe(MAX_OFFSET_DB);
  });
  it("finds by device and resolves offset with a default fallback", () => {
    const list = [cal({ deviceId: "mic-1", offsetDb: 118 })];
    expect(findCalibration(list, "mic-1")?.offsetDb).toBe(118);
    expect(findCalibration(list, "mic-2")).toBeNull();
    expect(offsetForDevice(list, "mic-1")).toBe(118);
    expect(offsetForDevice(list, "mic-2")).toBe(DEFAULT_CAL_OFFSET);
    // empty id resolves through the "default" key
    expect(offsetForDevice([cal({ deviceId: "default", offsetDb: 90 })], "")).toBe(90);
  });
  it("removes immutably", () => {
    const list = [cal({ deviceId: "mic-1" }), cal({ deviceId: "mic-2" })];
    const after = removeCalibration(list, "mic-1");
    expect(after).toHaveLength(1);
    expect(after[0].deviceId).toBe("mic-2");
    expect(list).toHaveLength(2);
  });
});

describe("JSON round-trip and robust parse", () => {
  it("round-trips a valid table", () => {
    const list = [
      cal({ deviceId: "mic-1", offsetDb: 120, label: "UMIK-1", referenceSpl: 94 }),
    ];
    expect(parseCalibrationsJson(calibrationsToJson(list))).toEqual(list);
  });
  it("returns [] for null/garbage/non-array JSON, never throwing", () => {
    expect(parseCalibrationsJson(null)).toEqual([]);
    expect(parseCalibrationsJson("")).toEqual([]);
    expect(parseCalibrationsJson("{not json")).toEqual([]);
    expect(parseCalibrationsJson('{"a":1}')).toEqual([]);
    expect(parseCalibrationsJson('"a string"')).toEqual([]);
  });
  it("drops entries with missing deviceId or non-finite offset", () => {
    const json = JSON.stringify([
      { offsetDb: 100, calibratedAt: 1 }, // no deviceId
      { deviceId: "mic-2", offsetDb: "x", calibratedAt: 1 }, // bad offset
      { deviceId: "mic-3", offsetDb: null, calibratedAt: 1 }, // bad offset
      { deviceId: "mic-4", offsetDb: 118, calibratedAt: 5 }, // valid
    ]);
    const parsed = parseCalibrationsJson(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].deviceId).toBe("mic-4");
  });
  it("clamps out-of-range offsets and defaults a missing timestamp", () => {
    const json = JSON.stringify([{ deviceId: "mic-1", offsetDb: 999 }]);
    const parsed = parseCalibrationsJson(json);
    expect(parsed[0].offsetDb).toBe(MAX_OFFSET_DB);
    expect(parsed[0].calibratedAt).toBe(0);
  });
  it("keeps only the first of duplicate deviceIds", () => {
    const json = JSON.stringify([
      { deviceId: "mic-1", offsetDb: 100, calibratedAt: 1 },
      { deviceId: "mic-1", offsetDb: 130, calibratedAt: 2 },
    ]);
    const parsed = parseCalibrationsJson(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].offsetDb).toBe(100);
  });
  it("drops a non-finite referenceSpl but keeps the entry", () => {
    const json = JSON.stringify([
      { deviceId: "mic-1", offsetDb: 120, referenceSpl: null, calibratedAt: 1 },
    ]);
    const parsed = parseCalibrationsJson(json);
    expect(parsed[0].referenceSpl).toBeUndefined();
    expect(parsed[0].offsetDb).toBe(120);
  });
});
