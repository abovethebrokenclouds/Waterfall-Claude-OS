import { describe, it, expect } from "vitest";
import {
  addSession,
  removeSession,
  sessionsToJson,
  parseSessionsJson,
  makeSession,
  type MeasurementSession,
} from "./measurementSessions";
import type { TransferPoint } from "./dsp/transfer";

function pt(freq: number): TransferPoint {
  return { freq, magDb: -3, phaseDeg: 45, coherence: 0.9 };
}

const captures: TransferPoint[][] = [
  [pt(100), pt(1000), pt(10000)],
  [pt(100), pt(1000), pt(10000)],
];

function sample(): MeasurementSession {
  return makeSession(
    {
      name: "Main room average",
      captures,
      delay: { samples: 41, ms: 0.85, peak: 0.97 },
      refLabel: "Ref tap",
      measLabel: "Meas tap",
    },
    "m-1",
    1719500000000,
  );
}

describe("makeSession", () => {
  it("builds a session with passed-in id/savedAt and no Date.now", () => {
    const s = sample();
    expect(s.id).toBe("m-1");
    expect(s.savedAt).toBe(1719500000000);
    expect(s.name).toBe("Main room average");
    expect(s.refLabel).toBe("Ref tap");
    expect(s.measLabel).toBe("Meas tap");
    expect(s.delay).toEqual({ samples: 41, ms: 0.85, peak: 0.97 });
    expect(s.captures).toHaveLength(2);
  });

  it("deep-copies captures so later source mutation is isolated", () => {
    const src: TransferPoint[][] = [[pt(100)]];
    const s = makeSession({ name: "x", captures: src }, "m-2", 1);
    src[0][0].magDb = 999;
    expect(s.captures[0][0].magDb).toBe(-3);
  });

  it("omits optional fields when not provided", () => {
    const s = makeSession({ name: "bare", captures: [] }, "m-3", 2);
    expect(s.delay).toBeUndefined();
    expect(s.refLabel).toBeUndefined();
    expect(s.measLabel).toBeUndefined();
  });
});

describe("addSession / removeSession", () => {
  it("adds newest-first without mutating the input", () => {
    const list: MeasurementSession[] = [];
    const a = sample();
    const next = addSession(list, a);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("m-1");
    expect(list).toHaveLength(0);
    const b = makeSession({ name: "second", captures: [] }, "m-2", 3);
    const after = addSession(next, b);
    expect(after.map((s) => s.id)).toEqual(["m-2", "m-1"]);
  });

  it("removes by id without mutating the input", () => {
    const list = [sample()];
    const next = removeSession(list, "m-1");
    expect(next).toHaveLength(0);
    expect(list).toHaveLength(1);
  });

  it("no-ops on an unknown id", () => {
    const list = [sample()];
    expect(removeSession(list, "nope")).toHaveLength(1);
  });
});

describe("json round-trip", () => {
  it("round-trips a session through json -> parse", () => {
    const list = [sample()];
    const json = sessionsToJson(list);
    const back = parseSessionsJson(json);
    expect(back).toEqual(list);
  });

  it("preserves captures and the spatial-average inputs exactly", () => {
    const back = parseSessionsJson(sessionsToJson([sample()]));
    expect(back[0].captures).toEqual(captures);
  });
});

describe("parseSessionsJson tolerance", () => {
  it("returns [] on malformed json", () => {
    expect(parseSessionsJson("{not json")).toEqual([]);
    expect(parseSessionsJson("")).toEqual([]);
  });

  it("returns [] when the top level is not an array", () => {
    expect(parseSessionsJson('{"id":"x"}')).toEqual([]);
    expect(parseSessionsJson("42")).toEqual([]);
    expect(parseSessionsJson("null")).toEqual([]);
  });

  it("drops sessions whose capture point has a NaN field", () => {
    const bad = {
      id: "b-1",
      name: "bad",
      savedAt: 1,
      captures: [[{ freq: NaN, magDb: 0, phaseDeg: 0, coherence: 1 }]],
    };
    // NaN survives JSON.stringify as null, so build the raw text directly.
    const raw = `[${JSON.stringify(sample())},{"id":"b-1","name":"bad","savedAt":1,"captures":[[{"freq":null,"magDb":0,"phaseDeg":0,"coherence":1}]]}]`;
    const out = parseSessionsJson(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m-1");
    // sanity: the bad object really is invalid-shaped
    expect(bad.captures[0][0].freq).toBeNaN();
  });

  it("drops sessions missing required fields", () => {
    const raw = JSON.stringify([
      { name: "no id", savedAt: 1, captures: [] }, // missing id
      { id: "ok", name: "fine", savedAt: 2, captures: [] },
    ]);
    const out = parseSessionsJson(raw);
    expect(out.map((s) => s.id)).toEqual(["ok"]);
  });

  it("rejects a session with a non-numeric savedAt", () => {
    const raw = JSON.stringify([
      { id: "x", name: "x", savedAt: "soon", captures: [] },
    ]);
    expect(parseSessionsJson(raw)).toEqual([]);
  });

  it("rejects a bad delay sub-object but keeps a valid one", () => {
    const raw = JSON.stringify([
      { id: "x", name: "x", savedAt: 1, captures: [], delay: { samples: 1 } },
    ]);
    expect(parseSessionsJson(raw)).toEqual([]);
  });

  it("strips unknown extra fields on a valid session", () => {
    const raw = JSON.stringify([
      { id: "x", name: "x", savedAt: 1, captures: [], bogus: "drop me" },
    ]);
    const out = parseSessionsJson(raw);
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("bogus");
  });
});
