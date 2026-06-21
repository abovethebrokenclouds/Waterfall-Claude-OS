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
