import { describe, it, expect } from "vitest";
import {
  sessionsToJson,
  sessionsToCsv,
  sampleSessions,
  type Session,
} from "./sessions";

const sample: Session[] = [
  {
    id: "s-1",
    name: 'Quote "test"',
    mode: "SPL",
    createdAt: "2026-06-22T00:00:00.000Z",
    notes: "line1, with comma",
    tags: ["a", "b"],
    value: 94.5,
    unit: "dBA",
  },
];

describe("sessionsToJson", () => {
  it("round-trips through JSON.parse", () => {
    const json = sessionsToJson(sample);
    expect(JSON.parse(json)).toEqual(sample);
  });
});

describe("sessionsToCsv", () => {
  it("emits a header and one row per session", () => {
    const csv = sessionsToCsv(sample);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("id,name,mode,createdAt,value,unit,tags,notes");
    expect(lines.length).toBe(2);
  });

  it("quotes fields containing commas and quotes", () => {
    const csv = sessionsToCsv(sample);
    expect(csv).toContain('"Quote ""test"""');
    expect(csv).toContain('"line1, with comma"');
  });

  it("joins tags with a pipe", () => {
    const csv = sessionsToCsv(sample);
    expect(csv).toContain("a|b");
  });

  it("handles an empty list (header only)", () => {
    expect(sessionsToCsv([])).toBe(
      "id,name,mode,createdAt,value,unit,tags,notes",
    );
  });
});

describe("sampleSessions", () => {
  it("returns deterministic demo data", () => {
    const a = sampleSessions();
    const b = sampleSessions();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
