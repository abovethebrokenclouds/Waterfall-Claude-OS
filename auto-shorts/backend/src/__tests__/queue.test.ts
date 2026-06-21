import { describe, it, expect } from "vitest";
import { RedisRenderQueue, type RedisLike } from "../services/queue";
import type { VideoSpec } from "../types";

/** In-memory stand-in for the bits of a redis client the queue uses. */
class FakeRedis implements RedisLike {
  lists = new Map<string, string[]>();
  hashes = new Map<string, Map<string, string>>();

  async rPush(key: string, value: string): Promise<number> {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
    return list.length;
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map();
    const isNew = hash.has(field) ? 0 : 1;
    hash.set(field, value);
    this.hashes.set(key, hash);
    return isNew;
  }

  async hGet(key: string, field: string): Promise<string | null> {
    return this.hashes.get(key)?.get(field) ?? null;
  }
}

const spec = { id: "spec_1", shortId: "short_1" } as unknown as VideoSpec;

describe("RedisRenderQueue", () => {
  it("enqueues a job: stores JSON in the hash and pushes the id on the list", async () => {
    const redis = new FakeRedis();
    const queue = new RedisRenderQueue(redis);

    const job = await queue.enqueue(spec);

    expect(job.status).toBe("queued");
    expect(job.shortId).toBe("short_1");
    expect(redis.lists.get("auto-shorts:renders")).toEqual([job.id]);
    expect(redis.hashes.get("auto-shorts:jobs")?.has(job.id)).toBe(true);
  });

  it("round-trips a job through get", async () => {
    const redis = new FakeRedis();
    const queue = new RedisRenderQueue(redis);
    const job = await queue.enqueue(spec);

    const fetched = await queue.get(job.id);
    expect(fetched?.id).toBe(job.id);
    expect(fetched?.spec.shortId).toBe("short_1");
  });

  it("returns undefined for an unknown job id", async () => {
    const queue = new RedisRenderQueue(new FakeRedis());
    expect(await queue.get("missing")).toBeUndefined();
  });

  it("honours custom keys", async () => {
    const redis = new FakeRedis();
    const queue = new RedisRenderQueue(redis, {
      queueKey: "q",
      jobsKey: "j",
    });
    const job = await queue.enqueue(spec);
    expect(redis.lists.get("q")).toEqual([job.id]);
    expect(redis.hashes.get("j")?.has(job.id)).toBe(true);
  });
});
