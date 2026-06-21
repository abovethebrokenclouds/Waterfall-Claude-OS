import { describe, it, expect } from "vitest";
import {
  PostgresShortsRepository,
  type SqlExecutor,
} from "../services/storage";
import type { GenerateShortsResult, ShortPlan, VideoSpec } from "../types";

/** Records queries and returns programmed row sets, in order. */
class FakeSql implements SqlExecutor {
  calls: { text: string; params?: unknown[] }[] = [];
  private responses: Array<Record<string, unknown>>[] = [];

  program(rows: Array<Record<string, unknown>>): void {
    this.responses.push(rows);
  }

  async query(text: string, params?: unknown[]) {
    this.calls.push({ text, params });
    return { rows: this.responses.shift() ?? [] };
  }
}

const plan: ShortPlan = {
  id: "short_1",
  highlightId: "hl_1",
  title: "T",
  hook: "Hook",
  theme: "x",
  startSec: 0,
  endSec: 10,
  durationSec: 10,
  layout: "full_bleed",
  captionStyle: {
    font: "Inter",
    size: 64,
    color: "#fff",
    highlightColor: "#fc0",
    position: "bottom",
  },
  cta: "Follow",
  platforms: ["tiktok"],
};

const spec = { id: "spec_1", shortId: "short_1" } as unknown as VideoSpec;

describe("PostgresShortsRepository", () => {
  it("upserts one row per short with serialized plan + spec", async () => {
    const sql = new FakeSql();
    const repo = new PostgresShortsRepository(sql);
    const result = {
      shorts: [plan],
      videoSpecs: [spec],
    } as unknown as GenerateShortsResult;

    await repo.saveResult(result);

    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0].text).toMatch(/INSERT INTO shorts/);
    expect(sql.calls[0].text).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(sql.calls[0].params?.[0]).toBe("short_1");
    expect(JSON.parse(sql.calls[0].params?.[1] as string).hook).toBe("Hook");
    expect(JSON.parse(sql.calls[0].params?.[2] as string).id).toBe("spec_1");
  });

  it("stores null spec when a short has none", async () => {
    const sql = new FakeSql();
    const repo = new PostgresShortsRepository(sql);
    await repo.saveResult({
      shorts: [plan],
      videoSpecs: [],
    } as unknown as GenerateShortsResult);
    expect(sql.calls[0].params?.[2]).toBeNull();
  });

  it("maps a row back, parsing jsonb whether string or object", async () => {
    const sql = new FakeSql();
    sql.program([{ plan: JSON.stringify(plan), spec: { id: "spec_1" } }]);
    const repo = new PostgresShortsRepository(sql);

    const stored = await repo.getShort("short_1");
    expect(stored?.plan.id).toBe("short_1");
    expect(stored?.spec?.id).toBe("spec_1");
    expect(sql.calls[0].params).toEqual(["short_1"]);
  });

  it("returns undefined when no row matches", async () => {
    const sql = new FakeSql();
    const repo = new PostgresShortsRepository(sql);
    expect(await repo.getShort("nope")).toBeUndefined();
  });
});
