/**
 * Persistence boundary. Production backs this with Postgres + S3; the in-memory
 * implementation keeps the API runnable in dev and tests.
 */
import type { GenerateShortsResult, ShortPlan, VideoSpec } from "../types";

export interface StoredShort {
  plan: ShortPlan;
  spec?: VideoSpec;
}

export interface ShortsRepository {
  saveResult(result: GenerateShortsResult): Promise<void>;
  getShort(shortId: string): Promise<StoredShort | undefined>;
}

export class InMemoryShortsRepository implements ShortsRepository {
  private shorts = new Map<string, StoredShort>();

  async saveResult(result: GenerateShortsResult): Promise<void> {
    const specByShort = new Map(result.videoSpecs.map((s) => [s.shortId, s]));
    for (const plan of result.shorts) {
      this.shorts.set(plan.id, { plan, spec: specByShort.get(plan.id) });
    }
  }

  async getShort(shortId: string): Promise<StoredShort | undefined> {
    return this.shorts.get(shortId);
  }
}

/* -------------------------------------------------------------------------- */
/* Postgres-backed repository                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The minimal SQL surface the repository needs — satisfied by a `pg` Pool. Kept
 * as a local interface so this module is testable with an in-memory fake and
 * carries no hard dependency on the driver (wired in `index.ts`).
 */
export interface SqlExecutor {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** jsonb columns arrive parsed from `pg`; a fake may hand back a JSON string. */
function asJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export class PostgresShortsRepository implements ShortsRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async saveResult(result: GenerateShortsResult): Promise<void> {
    const specByShort = new Map(result.videoSpecs.map((s) => [s.shortId, s]));
    for (const plan of result.shorts) {
      const spec = specByShort.get(plan.id);
      await this.sql.query(
        `INSERT INTO shorts (id, plan, spec)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET plan = EXCLUDED.plan, spec = EXCLUDED.spec`,
        [plan.id, JSON.stringify(plan), spec ? JSON.stringify(spec) : null],
      );
    }
  }

  async getShort(shortId: string): Promise<StoredShort | undefined> {
    const { rows } = await this.sql.query(
      `SELECT plan, spec FROM shorts WHERE id = $1`,
      [shortId],
    );
    if (rows.length === 0) return undefined;
    const row = rows[0];
    const plan = asJson<ShortPlan>(row.plan);
    if (!plan) return undefined;
    return { plan, spec: asJson<VideoSpec>(row.spec) };
  }
}
